#!/usr/bin/env python3
"""
Cognito Recurring Task Generator - Phase 3d
Generates inbox_queue entries from recurring_tasks templates.

Usage:
    python generate_recurring.py              # Generate due recurring tasks
    python generate_recurring.py --dry-run    # Preview without creating
    python generate_recurring.py --list       # List all recurring tasks

Run this daily (e.g., via cron) to auto-generate recurring tasks.

Author: Cognito AI Assistant
Date: January 2026
"""

import os
import sys
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from dotenv import load_dotenv
from supabase import create_client, Client
import uuid

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

# How many days ahead to generate tasks
GENERATION_WINDOW_DAYS = 3


def get_supabase_client() -> Client:
    """Create and return Supabase client."""
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_due_recurring_tasks(supabase: Client, window_days: int = GENERATION_WINDOW_DAYS) -> List[Dict]:
    """
    Fetch recurring tasks that are due within the window.
    """
    cutoff = datetime.now() + timedelta(days=window_days)
    
    try:
        response = supabase.table('recurring_tasks').select('*').eq(
            'is_active', True
        ).lte(
            'next_due_at', cutoff.isoformat()
        ).order('next_due_at').execute()
        
        return response.data or []
    except Exception as e:
        logger.error(f"Failed to fetch recurring tasks: {e}")
        return []


def list_all_recurring_tasks(supabase: Client) -> List[Dict]:
    """List all recurring tasks."""
    try:
        response = supabase.table('recurring_tasks').select('*').order('title').execute()
        return response.data or []
    except Exception as e:
        logger.error(f"Failed to list recurring tasks: {e}")
        return []


def task_already_generated(supabase: Client, recurring_id: str, due_date: datetime) -> bool:
    """
    Check if a task has already been generated for this due date.
    We store the recurring_task_id in the message_id field to track this.
    """
    # Check for tasks with matching message_id pattern
    message_id_pattern = f"recurring:{recurring_id}:{due_date.strftime('%Y-%m-%d')}"
    
    try:
        response = supabase.table('inbox_queue').select('id').eq(
            'message_id', message_id_pattern
        ).execute()
        
        return len(response.data or []) > 0
    except Exception as e:
        logger.warning(f"Error checking existing task: {e}")
        return False


def create_task_from_recurring(
    supabase: Client,
    recurring: Dict,
    dry_run: bool = False
) -> Optional[str]:
    """
    Create an inbox_queue entry from a recurring task template.
    Returns the new task ID or None.
    """
    recurring_id = recurring['id']
    title = recurring['title']
    due_date = datetime.fromisoformat(recurring['next_due_at'].replace('Z', '+00:00'))
    
    # Generate unique message_id to prevent duplicates
    message_id = f"recurring:{recurring_id}:{due_date.strftime('%Y-%m-%d')}"
    
    # Check if already generated
    if task_already_generated(supabase, recurring_id, due_date):
        logger.info(f"Task already exists for '{title}' on {due_date.date()}")
        return None
    
    if dry_run:
        logger.info(f"[DRY RUN] Would create: {title} (due {due_date.date()})")
        return "dry-run"
    
    # Create the task
    task_data = {
        'message_id': message_id,
        'original_source_email': 'recurring@cognito.local',
        'real_sender': 'Cognito Recurring',
        'subject': f"[Recurring] {title}",
        'received_at': datetime.now().isoformat(),
        'source': 'recurring',
        'original_content': recurring.get('description', ''),
        'forwarded_from': None,
        'ai_domain': recurring.get('domain', 'Admin'),
        'ai_priority': recurring.get('priority', 'Normal'),
        'ai_summary': recurring.get('description', title),
        'ai_suggested_action': f"Complete: {title}",
        'ai_estimated_minutes': recurring.get('estimated_minutes', 30),
        'ai_inferred_deadline': recurring['next_due_at'],
        'ai_deadline_confidence': 1.0,
        'ai_deadline_source': f"Recurring schedule ({recurring['recurrence_type']})",
        'status': 'pending',
        'execution_status': 'pending',
        'retry_count': 0
    }
    
    try:
        response = supabase.table('inbox_queue').insert(task_data).execute()
        new_task = response.data[0] if response.data else None
        
        if new_task:
            logger.info(f"Created task: {title} -> {new_task['id']}")
            return new_task['id']
        
    except Exception as e:
        logger.error(f"Failed to create task for '{title}': {e}")
    
    return None


def update_next_due_date(supabase: Client, recurring: Dict):
    """
    Update the next_due_at for a recurring task after generation.
    """
    recurring_id = recurring['id']
    current_due = datetime.fromisoformat(recurring['next_due_at'].replace('Z', '+00:00'))
    recurrence_type = recurring['recurrence_type']
    
    # Calculate next due date
    if recurrence_type == 'weekly':
        next_due = current_due + timedelta(days=7)
    elif recurrence_type == 'biweekly':
        next_due = current_due + timedelta(days=14)
    elif recurrence_type == 'monthly':
        # Add roughly a month
        if current_due.month == 12:
            next_due = current_due.replace(year=current_due.year + 1, month=1)
        else:
            next_due = current_due.replace(month=current_due.month + 1)
    else:
        next_due = current_due + timedelta(days=7)
    
    try:
        supabase.table('recurring_tasks').update({
            'next_due_at': next_due.isoformat(),
            'last_generated_at': datetime.now().isoformat()
        }).eq('id', recurring_id).execute()
        
        logger.info(f"Updated next due: {recurring['title']} -> {next_due.date()}")
    except Exception as e:
        logger.error(f"Failed to update next_due_at: {e}")


def generate_recurring_tasks(dry_run: bool = False):
    """
    Main generation function.
    Finds recurring tasks due within the window and creates inbox_queue entries.
    """
    logger.info("=" * 60)
    logger.info("COGNITO RECURRING TASK GENERATOR")
    logger.info("=" * 60)
    
    if dry_run:
        logger.info("DRY RUN MODE - No changes will be made")
    
    # Validate config
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("Missing Supabase credentials")
        return
    
    supabase = get_supabase_client()
    
    # Fetch due tasks
    due_tasks = fetch_due_recurring_tasks(supabase)
    logger.info(f"Found {len(due_tasks)} recurring tasks due in next {GENERATION_WINDOW_DAYS} days")
    
    if not due_tasks:
        logger.info("No recurring tasks to generate")
        return
    
    # Generate each task
    created = 0
    skipped = 0
    
    for recurring in due_tasks:
        result = create_task_from_recurring(supabase, recurring, dry_run)
        
        if result:
            created += 1
            if not dry_run:
                update_next_due_date(supabase, recurring)
        else:
            skipped += 1
    
    # Summary
    logger.info("=" * 60)
    logger.info(f"GENERATION COMPLETE")
    logger.info(f"  Created: {created}")
    logger.info(f"  Skipped: {skipped}")
    logger.info("=" * 60)


def list_recurring_tasks():
    """List all recurring tasks."""
    supabase = get_supabase_client()
    tasks = list_all_recurring_tasks(supabase)
    
    print("\n" + "=" * 60)
    print("COGNITO RECURRING TASKS")
    print("=" * 60)
    
    if not tasks:
        print("No recurring tasks configured.")
        return
    
    for task in tasks:
        status = "✅ Active" if task['is_active'] else "⏸️ Paused"
        next_due = task.get('next_due_at', 'Not set')
        if next_due and 'T' in str(next_due):
            next_due = next_due[:10]  # Just date
        
        print(f"\n📋 {task['title']}")
        print(f"   Domain: {task['domain']} | Priority: {task['priority']}")
        print(f"   Duration: {task['estimated_minutes']} min | {task['recurrence_type'].capitalize()}")
        print(f"   Next Due: {next_due}")
        print(f"   Status: {status}")
    
    print("\n" + "=" * 60)


if __name__ == '__main__':
    if '--list' in sys.argv:
        list_recurring_tasks()
    else:
        dry_run_mode = '--dry-run' in sys.argv
        generate_recurring_tasks(dry_run=dry_run_mode)
