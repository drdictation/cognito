#!/usr/bin/env python3
"""
Cognito Model Battle Arena - Phase 4b
Compares "Fast Model" (Gemini) vs "Thinking Model" (Groq) side-by-side.

Usage:
    python src/scripts/model_battle.py
"""

import sys
import os
import textwrap
import json
from datetime import datetime

# Add src to path to import lib
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from src.lib.llm_router import LLMRouter

def print_separator(char='-', length=80):
    print(char * length)

def print_wrapped(text, width=80, prefix=''):
    if not text:
        return
    wrapper = textwrap.TextWrapper(width=width, initial_indent=prefix, subsequent_indent=prefix)
    print(wrapper.fill(str(text)))

def run_battle():
    print_separator('=')
    print("🥊 COGNITO MODEL BATTLE ARENA 🥊")
    print("Gemini Flash Lite (Fast) vs Groq Llama 3 70b (Thinking)")
    print_separator('=')

    # Check for API keys
    router = LLMRouter()
    if not router.gemini_key:
        print("❌ Missing GEMINI_API_KEY in .env")
        return
    if not router.groq_key:
        print("❌ Missing GROQ_API_KEY in .env")
        print("Please add it to run the battle.")
        return

    # Select Thinking Model
    print("\nSelect Thinking Model for Battle:")
    print("1. GPT OSS 20b")
    print("2. Llama 4 Scout (17b-16e)")
    print("3. Llama 4 Maverick (17b-128e)")
    print("4. GPT OSS 120b")
    
    choice = input("Enter choice (1-4): ").strip()
    
    # Map choice to router mode string (must match ModelMode enum values)
    thinking_model_mode = 'llama-4-scout'
    model_name = "Llama 4 Scout"

    if choice == '1':
        thinking_model_mode = 'gpt-oss-20b'
        model_name = "GPT OSS 20b"
    elif choice == '2':
        thinking_model_mode = 'llama-4-scout'
        model_name = "Llama 4 Scout"
    elif choice == '3':
        thinking_model_mode = 'llama-4-maverick'
        model_name = "Llama 4 Maverick"
    elif choice == '4':
        thinking_model_mode = 'gpt-oss-120b'
        model_name = "GPT OSS 120b"

    # Get Input
    print("\nPaste the email content below (Press Ctrl+D or Ctrl+Z on new line when done):")
    try:
        email_content = sys.stdin.read().strip()
    except KeyboardInterrupt:
        return

    if not email_content:
        print("No content provided. Exiting.")
        return

    print(f"\n\n🔥 FIIIIIIIGHT! Gemini vs {model_name}...\n")
    
    # System prompt similar to production
    system_prompt = """
    You are an expert executive assistant. Analyze the incoming email.
    Return JSON with:
    - summary: 1 sentence summary
    - priority: Critical, High, Normal, Low
    - domain: Clinical, Admin, Research, Personal
    - reasoning: Why you chose this priority/domain
    - action_plan: What the user should do next
    """

    start_time = datetime.now()
    
    # Run Fast
    fast_result = router.generate(email_content, system_prompt=system_prompt, mode='fast')
    
    # Run Thinking
    thinking_result = router.generate(email_content, system_prompt=system_prompt, mode=thinking_model_mode)
    
    duration = (datetime.now() - start_time).total_seconds()

    # Parse contents
    fast_content = fast_result.get('content', {})
    thinking_content = thinking_result.get('content', {})
    
    # Display Results
    print_separator('=')
    print(f"BATTLE RESULTS (Took {duration:.2f}s)")
    print_separator('=')
    
    # Table Header
    col_width = 45
    print(f"{'METRIC':<15} | {'GEMINI (FAST)':<{col_width}} | {model_name.upper():<{col_width}}")
    print_separator('-')
    
    # Metrics to compare
    metrics = ['priority', 'domain', 'summary', 'action_plan', 'reasoning']
    
    for metric in metrics:
        val_fast = str(fast_content.get(metric, 'N/A'))
        val_thinking = str(thinking_content.get(metric, 'N/A'))
        
        # Wrap text for table cells
        wrapped_fast = textwrap.wrap(val_fast, col_width)
        wrapped_thinking = textwrap.wrap(val_thinking, col_width)
        
        max_lines = max(len(wrapped_fast), len(wrapped_thinking))
        
        for i in range(max_lines):
            line_fast = wrapped_fast[i] if i < len(wrapped_fast) else ""
            line_thinking = wrapped_thinking[i] if i < len(wrapped_thinking) else ""
            metric_label = metric.upper() if i == 0 else ""
            print(f"{metric_label:<15} | {line_fast:<{col_width}} | {line_thinking:<{col_width}}")
        
        print_separator('-')

    print("\n🏆 WINNER DECISION:")
    print("Review the 'Reasoning' and 'Action Plan' rows.")
    print("- Does the Thinking model catch nuances the Fast model missed?")
    print("- Is the extra intelligence worth the latency?")

if __name__ == "__main__":
    run_battle()
