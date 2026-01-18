#!/usr/bin/env python3
"""
Cognito Calendar Utilities - Phase 3b
Reads Google Calendar to check availability across consolidated calendars.

Requires:
- Calendar API scope added to OAuth
- All 6 calendars subscribed/shared to central Gmail calendar

Author: Cognito AI Assistant
Date: January 2026
"""

import os
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# =====================================================
# CONFIGURATION
# =====================================================

# Updated scopes to include Calendar
SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar.readonly',  # Read calendar
    'https://www.googleapis.com/auth/calendar.events'     # Create events
]

CREDENTIALS_PATH = os.getenv('GMAIL_CREDENTIALS_PATH', 'credentials.json')
TOKEN_PATH = os.getenv('GMAIL_TOKEN_PATH', 'token.json')


# =====================================================
# GOOGLE CALENDAR SERVICE
# =====================================================

def get_calendar_service():
    """
    Authenticate and return Google Calendar API service.
    
    Note: This shares credentials with Gmail. If calendar scopes weren't
    granted previously, user will need to re-authenticate.
    """
    creds = None
    
    # Load existing token
    if os.path.exists(TOKEN_PATH):
        creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)
    
    # If no valid credentials, authenticate
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception as e:
                logger.warning(f"Token refresh failed: {e}. Will re-authenticate.")
                creds = None
        
        if not creds:
            if not os.path.exists(CREDENTIALS_PATH):
                raise FileNotFoundError(
                    f"Credentials file not found: {CREDENTIALS_PATH}\n"
                    "Follow README.md to set up Gmail/Calendar API credentials."
                )
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_PATH, SCOPES)
            creds = flow.run_local_server(port=0)
        
        # Save credentials for next run
        with open(TOKEN_PATH, 'w') as token:
            token.write(creds.to_json())
    
    return build('calendar', 'v3', credentials=creds)


# =====================================================
# CALENDAR READ FUNCTIONS
# =====================================================

def get_calendar_list(service) -> List[Dict]:
    """
    Get all calendars visible to the user.
    This includes subscribed calendars (from the 6 accounts).
    """
    try:
        calendars = []
        page_token = None
        
        while True:
            calendar_list = service.calendarList().list(
                pageToken=page_token,
                showHidden=False
            ).execute()
            
            for calendar in calendar_list.get('items', []):
                calendars.append({
                    'id': calendar['id'],
                    'summary': calendar.get('summary', 'Untitled'),
                    'primary': calendar.get('primary', False),
                    'access_role': calendar.get('accessRole', 'reader')
                })
            
            page_token = calendar_list.get('nextPageToken')
            if not page_token:
                break
        
        logger.info(f"Found {len(calendars)} calendars")
        return calendars
    
    except HttpError as e:
        logger.error(f"Error fetching calendar list: {e}")
        return []


def get_free_busy(
    service,
    start_time: datetime,
    end_time: datetime,
    calendar_ids: List[str] = None
) -> Dict[str, List[Dict]]:
    """
    Get free/busy information for specified time range.
    
    Args:
        service: Google Calendar API service
        start_time: Start of time range
        end_time: End of time range
        calendar_ids: List of calendar IDs to check. If None, uses primary.
    
    Returns:
        Dict mapping calendar ID to list of busy periods
        Each busy period has 'start' and 'end' datetime strings
    """
    if calendar_ids is None:
        calendar_ids = ['primary']
    
    try:
        body = {
            'timeMin': start_time.isoformat() + 'Z',
            'timeMax': end_time.isoformat() + 'Z',
            'items': [{'id': cal_id} for cal_id in calendar_ids]
        }
        
        response = service.freebusy().query(body=body).execute()
        
        busy_times = {}
        for cal_id, cal_data in response.get('calendars', {}).items():
            busy_times[cal_id] = cal_data.get('busy', [])
        
        return busy_times
    
    except HttpError as e:
        logger.error(f"Error fetching free/busy: {e}")
        return {}


def get_events(
    service,
    start_time: datetime,
    end_time: datetime,
    calendar_id: str = 'primary',
    max_results: int = 50
) -> List[Dict]:
    """
    Get calendar events for specified time range.
    
    Args:
        service: Google Calendar API service
        start_time: Start of time range
        end_time: End of time range
        calendar_id: Calendar to fetch from
        max_results: Maximum events to return
    
    Returns:
        List of event dictionaries
    """
    try:
        events_result = service.events().list(
            calendarId=calendar_id,
            timeMin=start_time.isoformat() + 'Z',
            timeMax=end_time.isoformat() + 'Z',
            maxResults=max_results,
            singleEvents=True,
            orderBy='startTime'
        ).execute()
        
        events = events_result.get('items', [])
        
        # Simplify event data
        simplified = []
        for event in events:
            simplified.append({
                'id': event['id'],
                'summary': event.get('summary', 'Busy'),
                'start': event['start'].get('dateTime', event['start'].get('date')),
                'end': event['end'].get('dateTime', event['end'].get('date')),
                'all_day': 'date' in event['start'],
                'status': event.get('status', 'confirmed')
            })
        
        return simplified
    
    except HttpError as e:
        logger.error(f"Error fetching events: {e}")
        return []


def find_free_slots(
    service,
    duration_minutes: int,
    start_time: datetime = None,
    end_time: datetime = None,
    calendar_ids: List[str] = None,
    working_hours: Tuple[int, int] = (9, 17)
) -> List[Dict]:
    """
    Find available time slots of specified duration.
    
    Args:
        service: Google Calendar API service
        duration_minutes: Required slot duration
        start_time: Search start (default: now)
        end_time: Search end (default: 7 days from now)
        calendar_ids: Calendars to check
        working_hours: Tuple of (start_hour, end_hour) for working day
    
    Returns:
        List of available slots with 'start' and 'end' datetimes
    """
    if start_time is None:
        start_time = datetime.utcnow()
    if end_time is None:
        end_time = start_time + timedelta(days=7)
    
    # Get all busy periods
    busy_data = get_free_busy(service, start_time, end_time, calendar_ids)
    
    # Merge all busy periods
    all_busy = []
    for periods in busy_data.values():
        for period in periods:
            all_busy.append({
                'start': datetime.fromisoformat(period['start'].replace('Z', '+00:00')),
                'end': datetime.fromisoformat(period['end'].replace('Z', '+00:00'))
            })
    
    # Sort by start time
    all_busy.sort(key=lambda x: x['start'])
    
    # Find gaps that fit the duration
    free_slots = []
    current = start_time
    duration = timedelta(minutes=duration_minutes)
    
    for busy in all_busy:
        busy_start = busy['start'].replace(tzinfo=None)
        busy_end = busy['end'].replace(tzinfo=None)
        
        # Check if there's a gap before this busy period
        if busy_start > current:
            gap_start = current
            gap_end = busy_start
            
            # Only consider working hours
            if gap_start.hour >= working_hours[0] and gap_end.hour <= working_hours[1]:
                if (gap_end - gap_start) >= duration:
                    free_slots.append({
                        'start': gap_start,
                        'end': gap_start + duration,
                        'gap_size_minutes': int((gap_end - gap_start).total_seconds() / 60)
                    })
        
        # Move current pointer
        if busy_end > current:
            current = busy_end
    
    return free_slots[:10]  # Return top 10 slots


def get_availability_summary(
    service,
    days: int = 7
) -> Dict:
    """
    Get a human-readable summary of availability for the next N days.
    
    Returns:
        Dict with daily summaries and total free time
    """
    now = datetime.utcnow()
    end = now + timedelta(days=days)
    
    # Get all calendars
    calendars = get_calendar_list(service)
    calendar_ids = [c['id'] for c in calendars]
    
    # Get busy times
    busy_data = get_free_busy(service, now, end, calendar_ids)
    
    # Calculate total busy time
    total_busy_minutes = 0
    for periods in busy_data.values():
        for period in periods:
            start = datetime.fromisoformat(period['start'].replace('Z', '+00:00'))
            end_p = datetime.fromisoformat(period['end'].replace('Z', '+00:00'))
            total_busy_minutes += (end_p - start).total_seconds() / 60
    
    # Assume 8-hour workdays
    total_work_minutes = days * 8 * 60
    free_minutes = max(0, total_work_minutes - total_busy_minutes)
    
    return {
        'days_checked': days,
        'calendars_checked': len(calendar_ids),
        'total_busy_hours': round(total_busy_minutes / 60, 1),
        'total_free_hours': round(free_minutes / 60, 1),
        'busy_percentage': round((total_busy_minutes / total_work_minutes) * 100, 1) if total_work_minutes > 0 else 0
    }


# =====================================================
# CALENDAR WRITE FUNCTIONS (for time blocking)
# =====================================================

def create_time_block(
    service,
    title: str,
    start_time: datetime,
    end_time: datetime,
    description: str = None,
    calendar_id: str = 'primary'
) -> Optional[str]:
    """
    Create a time block event on the calendar.
    
    Args:
        service: Google Calendar API service
        title: Event title (e.g., "Cognito: Review PhD Draft")
        start_time: Event start
        end_time: Event end
        description: Event description
        calendar_id: Calendar to add event to
    
    Returns:
        Event ID if successful, None otherwise
    """
    try:
        event = {
            'summary': title,
            'description': description or 'Created by Cognito AI Executive Assistant',
            'start': {
                'dateTime': start_time.isoformat(),
                'timeZone': 'Australia/Melbourne'
            },
            'end': {
                'dateTime': end_time.isoformat(),
                'timeZone': 'Australia/Melbourne'
            },
            'visibility': 'private',  # Only user sees details
            'reminders': {
                'useDefault': False,
                'overrides': [
                    {'method': 'popup', 'minutes': 10}
                ]
            }
        }
        
        created_event = service.events().insert(
            calendarId=calendar_id,
            body=event
        ).execute()
        
        logger.info(f"Created calendar event: {title} at {start_time}")
        return created_event['id']
    
    except HttpError as e:
        logger.error(f"Error creating event: {e}")
        return None


# =====================================================
# CLI FOR TESTING
# =====================================================

if __name__ == '__main__':
    import sys
    
    print("=" * 60)
    print("COGNITO CALENDAR UTILITIES - Phase 3b")
    print("=" * 60)
    
    try:
        service = get_calendar_service()
        print("✅ Calendar API authenticated successfully!")
        
        # List calendars
        print("\n📅 Your Calendars:")
        calendars = get_calendar_list(service)
        for cal in calendars:
            primary = " (PRIMARY)" if cal['primary'] else ""
            print(f"  - {cal['summary']}{primary}")
        
        # Show availability summary
        print("\n📊 Availability Summary (next 7 days):")
        summary = get_availability_summary(service)
        print(f"  Calendars checked: {summary['calendars_checked']}")
        print(f"  Busy hours: {summary['total_busy_hours']}h")
        print(f"  Free hours: {summary['total_free_hours']}h")
        print(f"  Busy %: {summary['busy_percentage']}%")
        
        # Show upcoming events
        if '--events' in sys.argv:
            print("\n📋 Upcoming Events (next 24h):")
            now = datetime.utcnow()
            events = get_events(service, now, now + timedelta(days=1))
            for event in events[:10]:
                print(f"  - {event['start'][:16]}: {event['summary']}")
        
    except FileNotFoundError as e:
        print(f"❌ {e}")
    except Exception as e:
        print(f"❌ Error: {e}")
        print("\nIf you see 'insufficient scopes', you need to:")
        print("1. Delete token.json")
        print("2. Re-run this script to re-authenticate with calendar permissions")
