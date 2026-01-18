#!/usr/bin/env python3
"""
Cognito Task Execution Script - Phase 3c
Takes approved tasks, creates Trello cards, and schedules calendar time blocks.

Usage:
    python execute_tasks.py              # Execute with calendar scheduling
    python execute_tasks.py --dry-run    # Show what would be executed
    python execute_tasks.py --no-calendar # Skip calendar integration
    python execute_tasks.py --setup      # Create Trello board and lists

Author: Cognito AI Assistant
Date: January 2026
"""

import os
import sys
import json
import logging
import requests
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dotenv import load_dotenv
from supabase import create_client, Client

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

TRELLO_API_KEY = os.getenv('TRELLO_API_KEY')
TRELLO_TOKEN = os.getenv('TRELLO_TOKEN')
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

TRELLO_BASE_URL = 'https://api.trello.com/1'

# Trello board configuration
BOARD_NAME = 'Cognito Task Queue'
LIST_NAMES = {
    'today': '🔥 Today',
    'tomorrow': '📅 Tomorrow',
    'this_week': '📆 This Week',
    'later': '🗓️ Later',
    'completed': '✅ Completed'
}

# Domain to label color mapping
DOMAIN_COLORS = {
    'Clinical': 'red',
    'Research': 'purple',
    'Admin': 'blue',
    'Home': 'green',
    'Hobby': 'orange'
}

# Priority to label color mapping (fallback)
PRIORITY_COLORS = {
    'Critical': 'red',
    'High': 'orange',
    'Normal': 'yellow',
    'Low': 'sky'
}

# Calendar scheduling config
ENABLE_CALENDAR_SCHEDULING = True  # Set to False to disable calendar integration
CALENDAR_ID = 'primary'  # Or 'Cognito Tasks' sub-calendar if created


# =====================================================
# TRELLO API FUNCTIONS
# =====================================================

def get_trello_auth_params() -> Dict:
    """Return auth params for Trello API calls."""
    return {
        'key': TRELLO_API_KEY,
        'token': TRELLO_TOKEN
    }


def get_or_create_board() -> Optional[str]:
    """
    Get existing Cognito board or create a new one.
    
    Returns:
        Board ID or None if failed
    """
    # First, try to find existing board
    url = f'{TRELLO_BASE_URL}/members/me/boards'
    params = {**get_trello_auth_params(), 'fields': 'name,id'}
    
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        boards = response.json()
        
        for board in boards:
            if board['name'] == BOARD_NAME:
                logger.info(f"Found existing board: {BOARD_NAME} ({board['id']})")
                return board['id']
        
        # Board doesn't exist, create it
        logger.info(f"Creating new board: {BOARD_NAME}")
        create_url = f'{TRELLO_BASE_URL}/boards'
        create_params = {
            **get_trello_auth_params(),
            'name': BOARD_NAME,
            'defaultLists': 'false',  # We'll create our own lists
            'prefs_background': 'grey'
        }
        
        response = requests.post(create_url, params=create_params)
        response.raise_for_status()
        board = response.json()
        logger.info(f"Created board: {board['id']}")
        return board['id']
        
    except requests.RequestException as e:
        logger.error(f"Trello API error: {e}")
        return None


def get_board_lists(board_id: str) -> Dict[str, str]:
    """
    Get all lists on a board.
    
    Returns:
        Dict mapping list name to list ID
    """
    url = f'{TRELLO_BASE_URL}/boards/{board_id}/lists'
    params = {**get_trello_auth_params(), 'fields': 'name,id'}
    
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        lists = response.json()
        return {lst['name']: lst['id'] for lst in lists}
    except requests.RequestException as e:
        logger.error(f"Failed to get board lists: {e}")
        return {}


def create_list(board_id: str, name: str, pos: str = 'bottom') -> Optional[str]:
    """Create a new list on a board."""
    url = f'{TRELLO_BASE_URL}/lists'
    params = {
        **get_trello_auth_params(),
        'name': name,
        'idBoard': board_id,
        'pos': pos
    }
    
    try:
        response = requests.post(url, params=params)
        response.raise_for_status()
        lst = response.json()
        logger.info(f"Created list: {name} ({lst['id']})")
        return lst['id']
    except requests.RequestException as e:
        logger.error(f"Failed to create list {name}: {e}")
        return None


def setup_board_lists(board_id: str) -> Dict[str, str]:
    """
    Ensure all required lists exist on the board.
    
    Returns:
        Dict mapping list key to list ID
    """
    existing_lists = get_board_lists(board_id)
    list_ids = {}
    
    # Create lists in order
    position = 'top'
    for key, name in LIST_NAMES.items():
        if name in existing_lists:
            list_ids[key] = existing_lists[name]
            logger.info(f"List exists: {name}")
        else:
            list_id = create_list(board_id, name, position)
            if list_id:
                list_ids[key] = list_id
        position = 'bottom'  # First list at top, rest at bottom
    
    return list_ids


def get_or_create_label(board_id: str, name: str, color: str) -> Optional[str]:
    """Get or create a label on the board."""
    # Get existing labels
    url = f'{TRELLO_BASE_URL}/boards/{board_id}/labels'
    params = get_trello_auth_params()
    
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        labels = response.json()
        
        # Check if label exists
        for label in labels:
            if label['name'] == name:
                return label['id']
        
        # Create new label
        create_url = f'{TRELLO_BASE_URL}/labels'
        create_params = {
            **get_trello_auth_params(),
            'name': name,
            'color': color,
            'idBoard': board_id
        }
        response = requests.post(create_url, params=create_params)
        response.raise_for_status()
        label = response.json()
        return label['id']
        
    except requests.RequestException as e:
        logger.error(f"Failed to get/create label {name}: {e}")
        return None


def determine_target_list(task: Dict, list_ids: Dict[str, str]) -> str:
    """
    Determine which Trello list a task should go to based on deadline/priority.
    
    Args:
        task: Task dictionary from database
        list_ids: Dict mapping list key to list ID
    
    Returns:
        List ID for the task
    """
    now = datetime.now()
    today_end = now.replace(hour=23, minute=59, second=59)
    tomorrow_end = (now + timedelta(days=1)).replace(hour=23, minute=59, second=59)
    week_end = (now + timedelta(days=7)).replace(hour=23, minute=59, second=59)
    
    # Critical priority always goes to Today
    if task.get('ai_priority') == 'Critical':
        return list_ids.get('today', list_ids.get('later'))
    
    # Check deadline
    deadline_str = task.get('ai_inferred_deadline')
    if deadline_str:
        try:
            # Parse ISO format deadline
            if isinstance(deadline_str, str):
                deadline = datetime.fromisoformat(deadline_str.replace('Z', '+00:00'))
                deadline = deadline.replace(tzinfo=None)  # Make naive for comparison
            else:
                deadline = deadline_str
            
            if deadline <= today_end:
                return list_ids.get('today', list_ids.get('later'))
            elif deadline <= tomorrow_end:
                return list_ids.get('tomorrow', list_ids.get('later'))
            elif deadline <= week_end:
                return list_ids.get('this_week', list_ids.get('later'))
            else:
                return list_ids.get('later')
        except (ValueError, TypeError) as e:
            logger.warning(f"Could not parse deadline '{deadline_str}': {e}")
    
    # No deadline - use priority
    priority = task.get('ai_priority', 'Normal')
    if priority == 'High':
        return list_ids.get('this_week', list_ids.get('later'))
    else:
        return list_ids.get('later')


def create_trello_card(
    list_id: str,
    board_id: str,
    task: Dict
) -> Optional[Tuple[str, str]]:
    """
    Create a Trello card for a task.
    
    Returns:
        Tuple of (card_id, card_url) or None if failed
    """
    # Build card title
    priority = task.get('ai_priority', 'Normal')
    priority_emoji = {'Critical': '🔴', 'High': '🟠', 'Normal': '🟡', 'Low': '🔵'}.get(priority, '')
    subject = task.get('subject', 'No Subject')[:80]  # Truncate long subjects
    title = f"{priority_emoji} [{priority}] {subject}"
    
    # Build card description
    domain = task.get('ai_domain', 'Unknown')
    summary = task.get('ai_summary', '')
    action = task.get('ai_suggested_action', '')
    est_minutes = task.get('ai_estimated_minutes', 0)
    sender = task.get('real_sender', 'Unknown')
    deadline = task.get('ai_inferred_deadline', 'Not set')
    deadline_source = task.get('ai_deadline_source', '')
    
    description = f"""## Task Summary
{summary}

## Suggested Action
{action}

---

**📋 Domain:** {domain}
**⏱️ Estimated Time:** {est_minutes} minutes
**📧 From:** {sender}
**📅 Deadline:** {deadline}
{f'**📝 Deadline Source:** "{deadline_source}"' if deadline_source else ''}

---
*Created by Cognito AI Executive Assistant*
*Task ID: {task.get('id', 'unknown')}*
"""
    
    # Prepare due date
    due_date = None
    if task.get('ai_inferred_deadline'):
        try:
            due_date = task['ai_inferred_deadline']
            if isinstance(due_date, datetime):
                due_date = due_date.isoformat()
        except:
            pass
    
    # Create the card
    url = f'{TRELLO_BASE_URL}/cards'
    params = {
        **get_trello_auth_params(),
        'idList': list_id,
        'name': title,
        'desc': description,
        'pos': 'top'  # New cards at top of list
    }
    
    if due_date:
        params['due'] = due_date
    
    try:
        response = requests.post(url, params=params)
        response.raise_for_status()
        card = response.json()
        card_id = card['id']
        card_url = card['url']
        
        # Add domain label
        if domain in DOMAIN_COLORS:
            label_id = get_or_create_label(board_id, domain, DOMAIN_COLORS[domain])
            if label_id:
                add_label_url = f'{TRELLO_BASE_URL}/cards/{card_id}/idLabels'
                requests.post(add_label_url, params={
                    **get_trello_auth_params(),
                    'value': label_id
                })
        
        logger.info(f"Created card: {title[:50]}... -> {card_url}")
        return (card_id, card_url)
        
    except requests.RequestException as e:
        logger.error(f"Failed to create card: {e}")
        return None


# =====================================================
# DATABASE FUNCTIONS
# =====================================================

def get_supabase_client() -> Client:
    """Create and return Supabase client."""
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_pending_approved_tasks(supabase: Client) -> List[Dict]:
    """
    Fetch tasks that are approved but not yet executed.
    """
    try:
        response = supabase.table('inbox_queue').select('*').eq(
            'status', 'approved'
        ).eq(
            'execution_status', 'pending'
        ).order('created_at', desc=True).execute()
        
        return response.data or []
    except Exception as e:
        logger.error(f"Failed to fetch tasks: {e}")
        return []


def update_task_execution_status(
    supabase: Client,
    task_id: str,
    trello_card_id: str,
    trello_card_url: str,
    status: str = 'scheduled'
):
    """
    Update task with execution details.
    """
    try:
        supabase.table('inbox_queue').update({
            'execution_status': status,
            'trello_card_id': trello_card_id,
            'trello_card_url': trello_card_url,
            'executed_at': datetime.now().isoformat()
        }).eq('id', task_id).execute()
        
        logger.info(f"Updated task {task_id} with status: {status}")
    except Exception as e:
        logger.error(f"Failed to update task {task_id}: {e}")


# =====================================================
# CALENDAR SCHEDULING (Phase 3c)
# =====================================================

def get_calendar_service():
    """Get calendar service, importing from calendar_utils."""
    try:
        from calendar_utils import get_calendar_service as _get_cal_service
        return _get_cal_service()
    except ImportError:
        logger.warning("calendar_utils not found. Calendar scheduling disabled.")
        return None
    except Exception as e:
        logger.warning(f"Calendar auth failed: {e}. Calendar scheduling disabled.")
        return None


def find_optimal_slot(calendar_service, duration_minutes: int, prefer_morning: bool = True):
    """
    Find the next available time slot for a task.
    
    Args:
        calendar_service: Google Calendar API service
        duration_minutes: How long the task needs
        prefer_morning: If True, prefer slots before 12pm
    
    Returns:
        Tuple of (start_datetime, end_datetime) or None
    """
    try:
        from calendar_utils import find_free_slots
        from datetime import timezone
        
        # Search next 7 days for a slot
        now = datetime.now(timezone.utc)
        slots = find_free_slots(
            calendar_service,
            duration_minutes=duration_minutes,
            start_time=now,
            end_time=now + timedelta(days=7)
        )
        
        if not slots:
            logger.info("No free slots found in next 7 days")
            return None
        
        # Return first available slot
        slot = slots[0]
        return (slot['start'], slot['end'])
        
    except Exception as e:
        logger.warning(f"Could not find slot: {e}")
        return None


def create_calendar_event(
    calendar_service,
    task: Dict,
    start_time: datetime,
    end_time: datetime,
    trello_url: str = None
) -> Optional[str]:
    """
    Create a calendar time block for a task.
    
    Returns:
        Event ID if successful, None otherwise
    """
    try:
        from calendar_utils import create_time_block
        
        domain = task.get('ai_domain', 'Task')
        subject = task.get('subject', 'Cognito Task')[:50]
        title = f"[{domain}] {subject}"
        
        description = f"""**AI Summary:** {task.get('ai_summary', '')}

**Suggested Action:** {task.get('ai_suggested_action', '')}

**From:** {task.get('real_sender', 'Unknown')}

{f'**Trello Card:** {trello_url}' if trello_url else ''}

---
*Scheduled by Cognito AI Executive Assistant*
"""
        
        event_id = create_time_block(
            calendar_service,
            title=title,
            start_time=start_time,
            end_time=end_time,
            description=description,
            calendar_id=CALENDAR_ID
        )
        
        if event_id:
            logger.info(f"Created calendar event: {title} at {start_time.strftime('%Y-%m-%d %H:%M')}")
        
        return event_id
        
    except Exception as e:
        logger.warning(f"Failed to create calendar event: {e}")
        return None


def update_task_with_calendar(
    supabase: Client,
    task_id: str,
    calendar_event_id: str,
    scheduled_start: datetime,
    scheduled_end: datetime
):
    """Update task record with calendar event details."""
    try:
        supabase.table('inbox_queue').update({
            'calendar_event_id': calendar_event_id,
            'scheduled_start': scheduled_start.isoformat(),
            'scheduled_end': scheduled_end.isoformat()
        }).eq('id', task_id).execute()
        logger.info(f"Updated task {task_id} with calendar event")
    except Exception as e:
        logger.warning(f"Could not update task with calendar: {e}")


# =====================================================
# MAIN EXECUTION PIPELINE
# =====================================================

def setup_trello() -> Tuple[Optional[str], Dict[str, str]]:
    """
    Set up Trello board and lists.
    
    Returns:
        Tuple of (board_id, list_ids dict)
    """
    logger.info("Setting up Trello board and lists...")
    
    board_id = get_or_create_board()
    if not board_id:
        logger.error("Failed to get or create Trello board")
        return None, {}
    
    list_ids = setup_board_lists(board_id)
    if not list_ids:
        logger.error("Failed to set up board lists")
        return None, {}
    
    logger.info(f"Trello setup complete. Board: {board_id}, Lists: {len(list_ids)}")
    return board_id, list_ids


def execute_tasks(dry_run: bool = False, use_calendar: bool = True):
    """
    Main execution pipeline.
    
    1. Fetch approved tasks with pending execution status
    2. Set up Trello board/lists if needed
    3. Create cards for each task
    4. Find optimal calendar slot and create time block (Phase 3c)
    5. Update database with card IDs and event details
    """
    logger.info("=" * 60)
    logger.info("COGNITO TASK EXECUTION - Phase 3c (Intelligent Scheduling)")
    logger.info("=" * 60)
    
    if dry_run:
        logger.info("DRY RUN MODE - No changes will be made")
    
    # Validate configuration
    if not TRELLO_API_KEY or not TRELLO_TOKEN:
        logger.error("Missing Trello credentials. Set TRELLO_API_KEY and TRELLO_TOKEN.")
        return
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.")
        return
    
    # Initialize clients
    supabase = get_supabase_client()
    
    # Fetch pending tasks
    tasks = fetch_pending_approved_tasks(supabase)
    logger.info(f"Found {len(tasks)} approved tasks pending execution")
    
    if not tasks:
        logger.info("No tasks to execute. All done!")
        return
    
    # Set up Trello
    board_id, list_ids = setup_trello()
    if not board_id or not list_ids:
        logger.error("Trello setup failed. Aborting.")
        return
    
    # Initialize calendar service if enabled
    calendar_service = None
    if use_calendar and ENABLE_CALENDAR_SCHEDULING:
        calendar_service = get_calendar_service()
        if calendar_service:
            logger.info("Calendar scheduling enabled")
        else:
            logger.info("Calendar scheduling disabled (no service)")
    
    # Process each task
    success_count = 0
    fail_count = 0
    scheduled_count = 0
    
    for task in tasks:
        task_id = task['id']
        subject = task.get('subject', 'No Subject')[:40]
        est_minutes = task.get('ai_estimated_minutes', 30)  # Default 30 min
        
        logger.info(f"Processing: {subject}...")
        
        # Determine target list
        target_list_id = determine_target_list(task, list_ids)
        
        if dry_run:
            list_name = [k for k, v in list_ids.items() if v == target_list_id][0]
            logger.info(f"  [DRY RUN] Would create card in '{list_name}' list")
            if calendar_service:
                slot = find_optimal_slot(calendar_service, est_minutes)
                if slot:
                    logger.info(f"  [DRY RUN] Would schedule at {slot[0].strftime('%Y-%m-%d %H:%M')}")
            success_count += 1
            continue
        
        # Create Trello card
        result = create_trello_card(target_list_id, board_id, task)
        
        if result:
            card_id, card_url = result
            update_task_execution_status(supabase, task_id, card_id, card_url)
            success_count += 1
            
            # Phase 3c: Calendar scheduling
            if calendar_service and est_minutes > 0:
                slot = find_optimal_slot(calendar_service, est_minutes)
                if slot:
                    start_time, end_time = slot
                    event_id = create_calendar_event(
                        calendar_service, task, start_time, end_time, card_url
                    )
                    if event_id:
                        update_task_with_calendar(
                            supabase, task_id, event_id, start_time, end_time
                        )
                        scheduled_count += 1
        else:
            fail_count += 1
    
    # Summary
    logger.info("=" * 60)
    logger.info(f"EXECUTION COMPLETE")
    logger.info(f"  Trello Cards: {success_count}")
    logger.info(f"  Calendar Events: {scheduled_count}")
    logger.info(f"  Failed:  {fail_count}")
    logger.info("=" * 60)


if __name__ == '__main__':
    if '--setup' in sys.argv:
        # Just set up the board
        board_id, list_ids = setup_trello()
        if board_id:
            print(f"\n✅ Trello board ready!")
            print(f"   Board ID: {board_id}")
            print(f"   Lists: {list(LIST_NAMES.values())}")
    else:
        dry_run_mode = '--dry-run' in sys.argv
        use_calendar = '--no-calendar' not in sys.argv
        execute_tasks(dry_run=dry_run_mode, use_calendar=use_calendar)
