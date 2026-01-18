#!/usr/bin/env python3
"""
Cognito Email Ingestion Script - Phase 1
Fetches emails from central Gmail hub, analyzes with Gemini, saves to Supabase.

Usage:
    python ingest_hub.py              # Process unread emails
    python ingest_hub.py --dry-run    # Test without saving to DB
"""

import os
import re
import json
import base64
import logging
import random
import sys
from datetime import datetime, time, timedelta
from typing import Dict, List, Optional, Tuple
from pathlib import Path

# Add src to path to import lib
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))
from src.lib.llm_router import LLMRouter, ModelMode

# Third-party imports
import google.generativeai as genai
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# =====================================================
# CONFIGURATION
# =====================================================

SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events'
]

CREDENTIALS_PATH = os.getenv('GMAIL_CREDENTIALS_PATH', 'credentials.json')
TOKEN_PATH = os.getenv('GMAIL_TOKEN_PATH', 'token.json')

GEMINI_API_KEY = os.getenv('GOOGLE_AI_API_KEY')
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

CENTRAL_HUB_EMAIL = os.getenv('CENTRAL_HUB_EMAIL', 'chamarabfwd@gmail.com')

# Gemini model configuration
# CRITICAL: NO GEMINI MODEL BEFORE 2.5 SHOULD EVER BE CODED.
GEMINI_MODEL = 'gemini-2.5-flash-lite'

def load_system_prompt() -> str:
    """Load the refined system prompt from the markdown file."""
    prompt_path = Path(__file__).parent.parent.parent / 'prompts' / 'system_prompt_v1.md'
    try:
        with open(prompt_path, 'r') as f:
            return f.read()
    except Exception as e:
        logger.error(f"Could not load system prompt from {prompt_path}: {e}")
        # Return a fallback prompt if file loading fails
        return "You are an EA for a Gastroenterologist. Classify this email into Domain and Priority."

# =====================================================
# GMAIL API FUNCTIONS
# =====================================================

def get_gmail_service():
    """Authenticate and return Gmail API service."""
    creds = None
    
    # Load existing token
    if os.path.exists(TOKEN_PATH):
        creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)
    
    # If no valid credentials, authenticate
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(CREDENTIALS_PATH):
                raise FileNotFoundError(
                    f"Gmail credentials file not found: {CREDENTIALS_PATH}\n"
                    "Follow README.md to set up Gmail API credentials."
                )
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_PATH, SCOPES)
            creds = flow.run_local_server(port=0)
        
        # Save credentials for next run
        with open(TOKEN_PATH, 'w') as token:
            token.write(creds.to_json())
    
    return build('gmail', 'v1', credentials=creds)


def fetch_unread_emails(service, max_results: int = 50) -> List[Dict]:
    """
    Fetch unread emails from Gmail.
    
    Args:
        service: Gmail API service instance
        max_results: Maximum number of emails to fetch
    
    Returns:
        List of email dictionaries with id, message_id, subject, from, body, date
    """
    try:
        results = service.users().messages().list(
            userId='me',
            q='is:unread',
            maxResults=max_results
        ).execute()
        
        messages = results.get('messages', [])
        logger.info(f"Found {len(messages)} unread emails")
        
        emails = []
        for msg in messages:
            email_data = get_email_details(service, msg['id'])
            if email_data:
                emails.append(email_data)
        
        return emails
    
    except HttpError as error:
        logger.error(f"Gmail API error: {error}")
        return []


def get_email_details(service, msg_id: str) -> Optional[Dict]:
    """Extract email details from Gmail message."""
    try:
        message = service.users().messages().get(
            userId='me',
            id=msg_id,
            format='full'
        ).execute()
        
        headers = {h['name']: h['value'] for h in message['payload']['headers']}
        
        # Extract body
        body = ''
        if 'parts' in message['payload']:
            for part in message['payload']['parts']:
                if part['mimeType'] == 'text/plain':
                    body = base64.urlsafe_b64decode(part['body']['data']).decode('utf-8')
                    break
        elif 'body' in message['payload'] and 'data' in message['payload']['body']:
            body = base64.urlsafe_b64decode(message['payload']['body']['data']).decode('utf-8')
        
        return {
            'id': msg_id,
            'message_id': headers.get('Message-ID', msg_id),
            'subject': headers.get('Subject', 'No Subject'),
            'from': headers.get('From', 'Unknown'),
            'date': headers.get('Date', ''),
            'body': body,
            'headers': headers
        }
    
    except HttpError as error:
        logger.error(f"Error fetching email {msg_id}: {error}")
        return None


def mark_email_as_read(service, msg_id: str):
    """Mark email as read in Gmail."""
    try:
        service.users().messages().modify(
            userId='me',
            id=msg_id,
            body={'removeLabelIds': ['UNREAD']}
        ).execute()
        logger.debug(f"Marked email {msg_id} as read")
    except HttpError as error:
        logger.error(f"Error marking email as read: {error}")


# =====================================================
# EMAIL PARSING FUNCTIONS
# =====================================================

def extract_original_sender(email: Dict) -> Tuple[str, str]:
    """
    Extract the ORIGINAL sender from a forwarded email.
    
    Args:
        email: Email dictionary from Gmail
    
    Returns:
        Tuple of (original_sender_email, original_source_account)
    """
    body = email['body']
    headers = email['headers']
    
    # Check for forwarded email patterns in body
    # Pattern: "From: Name <email@domain.com>"
    forward_pattern = r'From:\s*(?:.*?<)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?'
    match = re.search(forward_pattern, body, re.IGNORECASE)
    
    if match:
        original_sender = match.group(1).lower()
        logger.debug(f"Extracted original sender from body: {original_sender}")
    else:
        # Fallback to From header (might be forwarding address)
        from_header = headers.get('From', '')
        email_match = re.search(r'([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', from_header)
        original_sender = email_match.group(1).lower() if email_match else 'unknown@unknown.com'
        logger.warning(f"Could not extract from forwarded body, using From header: {original_sender}")
    
    # Map sender domain to source account
    source_account = map_sender_to_source(original_sender)
    
    return original_sender, source_account


def map_sender_to_source(email: str) -> str:
    """
    Map an email address to one of the 6 source accounts.
    
    Args:
        email: Email address
    
    Returns:
        Source identifier (e.g., 'ms365_hospital', 'gmail_personal')
    """
    domain = email.split('@')[-1].lower()
    
    # Source mapping (align with email_source_mappings table)
    if 'hospital.org.au' in domain or 'health.vic.gov.au' in domain:
        return 'ms365_hospital'
    elif 'unimelb.edu.au' in domain:
        return 'ms365_university'
    elif 'privatepractice.com.au' in domain:
        return 'gmail_private_practice'
    elif 'project-domain.com' in domain:
        return 'gmail_project'
    elif 'gmail.com' in domain:
        return 'gmail_personal'
    elif 'hotmail.com' in domain or 'outlook.com' in domain:
        return 'hotmail_legacy'
    else:
        logger.warning(f"Unknown domain: {domain}, defaulting to gmail_personal")
        return 'gmail_personal'


# =====================================================
# BLOCKLIST FILTERING
# =====================================================

def check_blocklist(supabase: Client, sender: str) -> bool:
    """
    Check if sender matches any blocklist patterns.
    
    Args:
        supabase: Supabase client
        sender: Email address to check
    
    Returns:
        True if blocked, False otherwise
    """
    try:
        response = supabase.table('blocklist').select('email_pattern').eq('is_active', True).execute()
        
        for item in response.data:
            pattern = item['email_pattern'].replace('%', '.*')  # Convert SQL LIKE to regex
            if re.search(pattern, sender, re.IGNORECASE):
                logger.info(f"Sender {sender} matched blocklist pattern: {item['email_pattern']}")
                return True
        
        return False
    
    except Exception as error:
        logger.error(f"Error checking blocklist: {error}")
        return False  # Don't block on error


# =====================================================
# NO-FLY ZONE LOGIC
# =====================================================

def is_no_fly_zone(domain: str = None) -> bool:
    """
    Check if current time is within No-Fly Zone (Friday 17:00 - Sunday 18:00).
    
    Args:
        domain: Email domain (Home/Hobby bypass the restriction)
    
    Returns:
        True if in No-Fly Zone, False otherwise
    """
    # Bypass for Home/Hobby domains
    if domain in ['Home', 'Hobby']:
        return False
    
    now = datetime.now()
    current_time = now.time()
    
    # Friday after 17:00
    if now.weekday() == 4 and current_time >= time(17, 0):
        logger.info("No-Fly Zone active: Friday after 17:00")
        return True
    
    # Saturday (all day)
    if now.weekday() == 5:
        logger.info("No-Fly Zone active: Saturday")
        return True
    
    # Sunday before 18:00
    if now.weekday() == 6 and current_time < time(18, 0):
        logger.info("No-Fly Zone active: Sunday before 18:00")
        return True
    
    return False


# =====================================================
# GEMINI AI ANALYSIS
# =====================================================

# Initialize Router
llm_router = LLMRouter()

def analyze_with_gemini(email_content: str, sender: str, subject: str) -> Optional[Dict]:
    """
    Analyze email using LLM Router (Randomized Model Selection).
    """
    
    system_prompt = load_system_prompt()
    
    prompt = f"""
    Email From: {sender}
    Subject: {subject}
    
    Email Content:
    {email_content[:8000]}
    
    Analyze this email per instructions. Return JSON ONLY.

    [NEW REQUIREMENT - DRAFT GENERATION]
    1. Determine if this email is a "Simple Response" (e.g. scheduling confirmation, thank you, simple query, acknowledgment).
    2. Set "is_simple_response": true/false in JSON.
    3. If TRUE, write a polite, professional draft response signed "Chamara" in a field called "draft_response".
    4. If FALSE, set "draft_response": null.
    """

    # 🎲 RANDOMIZED MODEL SELECTION 🎲
    # 70% Gemini Flash Lite (Fast/Cheap)
    # 30% Thinking Models (Deeper Analysis)
    rand_val = random.random()
    
    if rand_val < 0.7:
        selected_mode = ModelMode.FAST.value
    else:
        # Randomly pick a thinking model
        thinking_modes = [
            ModelMode.LLAMA_4_SCOUT.value,
            ModelMode.GPT_20B.value,
            ModelMode.LLAMA_4_MAVERICK.value,
            ModelMode.GPT_120B.value
        ]
        selected_mode = random.choice(thinking_modes)

    logger.info(f"Analyzing email subject '{subject}' using model mode: {selected_mode}")

    try:
        # Call Router
        result = llm_router.generate(prompt, system_prompt=system_prompt, mode=selected_mode)
        
        if "error" in result:
             logger.error(f"LLM Error ({selected_mode}): {result['error']}")
             return None

        assessment = result.get('content', {})
        
        # Inject model usage info into assessment object
        # We need to make sure this is saved to the DB
        assessment['model_used'] = result.get('model', selected_mode)
        
        # Validate required fields
        required_fields = ['domain', 'priority', 'summary', 'reasoning', 'suggested_action', 'estimated_minutes']
        if not all(field in assessment for field in required_fields):
            logger.error(f"Missing required fields in LLM response: {assessment}")
            # Try to salvage partial response or return None? 
            # For now, stick to strict validation
            return None
            
        # Ensure draft fields are present (default to defaults if missing)
        if 'is_simple_response' not in assessment:
            assessment['is_simple_response'] = False
        if 'draft_response' not in assessment:
            assessment['draft_response'] = None

        return assessment

    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        return None
        
        logger.info(f"Gemini analysis: {assessment['domain']} - {assessment['priority']}")
        return assessment
    
    except json.JSONDecodeError as error:
        logger.error(f"Failed to parse Gemini JSON response: {response_text}\nError: {error}")
        return None
    except Exception as error:
        logger.error(f"Gemini API error: {error}")
        return None


# =====================================================
# SUPABASE DATABASE FUNCTIONS
# =====================================================

def save_to_inbox_queue(supabase: Client, email: Dict, assessment: Dict, original_sender: str, source_account: str, dry_run: bool = False):
    """
    Save email and AI assessment to Supabase inbox_queue table.
    
    Args:
        supabase: Supabase client
        email: Email data from Gmail
        assessment: AI assessment from Gemini
        original_sender: Original sender email
        source_account: Source account identifier
        dry_run: If True, log without saving to DB
    """
    data = {
        'message_id': email['message_id'],
        'original_source_email': source_account,
        'real_sender': original_sender,
        'subject': email['subject'],
        'received_at': email['date'],
        'source': 'email',
        'original_content': email['body'],
        'forwarded_from': email['from'],
        'ai_assessment': assessment,
        'ai_domain': assessment['domain'],
        'ai_priority': assessment['priority'],
        'ai_summary': assessment['summary'],
        'ai_suggested_action': assessment['suggested_action'],
        'ai_estimated_minutes': assessment['estimated_minutes'],
        'status': 'pending',
        # Phase 3a: Deadline inference fields
        'ai_inferred_deadline': assessment.get('inferred_deadline'),
        'ai_deadline_confidence': assessment.get('deadline_confidence'),
        'ai_deadline_source': assessment.get('deadline_source'),
        # Phase 4c: Model Tracking
        'model_used': assessment.get('model_used'),
        # Phase 5: Intelligent Drafting
        'is_simple_response': assessment.get('is_simple_response'),
        'draft_response': assessment.get('draft_response'),
        'execution_status': 'pending'
    }
    
    if dry_run:
        logger.info(f"[DRY RUN] Would save to inbox_queue: {data['subject']} - {data['ai_domain']} - {data['ai_priority']}")
        if data.get('ai_inferred_deadline'):
            logger.info(f"[DRY RUN] Inferred deadline: {data['ai_inferred_deadline']}")
        return
    
    try:
        # Upsert to handle duplicates (conflict on message_id)
        response = supabase.table('inbox_queue').upsert(data, on_conflict='message_id').execute()
        logger.info(f"Saved to inbox_queue: {email['subject']}")
    
    except Exception as error:
        logger.error(f"Error saving to Supabase: {error}")


# =====================================================
# MAIN PIPELINE
# =====================================================

def main(dry_run: bool = False):
    """
    Main ingestion pipeline.
    
    Args:
        dry_run: If True, fetch and analyze but don't save to DB or mark as read
    """
    logger.info("=" * 60)
    logger.info("Cognito Email Ingestion Pipeline - Phase 1")
    logger.info("=" * 60)
    
    # Validate environment variables
    missing_vars = []
    if not GEMINI_API_KEY: missing_vars.append("GOOGLE_AI_API_KEY")
    if not SUPABASE_URL or "your-project" in SUPABASE_URL: missing_vars.append("SUPABASE_URL")
    if not SUPABASE_KEY or "your_supabase_service_role_key" in SUPABASE_KEY: missing_vars.append("SUPABASE_SERVICE_KEY")
    
    if missing_vars:
        logger.error(f"Missing or placeholder environment variables: {', '.join(missing_vars)}")
        logger.info("Please update your .env file with actual values from Google AI Studio and Supabase.")
        return
    
    # Initialize services
    gmail_service = get_gmail_service()
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # Fetch unread emails
    emails = fetch_unread_emails(gmail_service)
    
    if not emails:
        logger.info("No unread emails to process")
        return
    
    # Process each email
    processed_count = 0
    blocked_count = 0
    error_count = 0
    
    for email in emails:
        try:
            logger.info(f"\nProcessing: {email['subject'][:50]}...")
            
            # Extract original sender
            original_sender, source_account = extract_original_sender(email)
            logger.info(f"Original sender: {original_sender} (Source: {source_account})")
            
            # Check blocklist
            if check_blocklist(supabase, original_sender):
                logger.info(f"Skipping blocked sender: {original_sender}")
                blocked_count += 1
                if not dry_run:
                    mark_email_as_read(gmail_service, email['id'])
                continue
            
            # Analyze with Gemini
            assessment = analyze_with_gemini(email['body'], original_sender, email['subject'])
            
            if not assessment:
                logger.error(f"Failed to get Gemini assessment for: {email['subject']}")
                error_count += 1
                continue
            
            # Check No-Fly Zone
            if is_no_fly_zone(assessment['domain']):
                logger.info("No-Fly Zone active - ingesting silently (no notifications)")
            
            # Save to database
            save_to_inbox_queue(supabase, email, assessment, original_sender, source_account, dry_run)
            
            # Mark as read
            if not dry_run:
                mark_email_as_read(gmail_service, email['id'])
            
            processed_count += 1
            
            # Add a small delay for rate limiting
            import time
            time.sleep(2)
        
        except Exception as error:
            logger.error(f"Error processing email {email['subject']}: {error}")
            error_count += 1
    
    # Summary
    logger.info("\n" + "=" * 60)
    logger.info(f"Processed: {processed_count}")
    logger.info(f"Blocked: {blocked_count}")
    logger.info(f"Errors: {error_count}")
    logger.info("=" * 60)


if __name__ == '__main__':
    import sys
    
    # Check for --dry-run flag
    dry_run_mode = '--dry-run' in sys.argv
    
    if dry_run_mode:
        logger.info("Running in DRY RUN mode - no database writes or email marking")
    
    main(dry_run=dry_run_mode)
