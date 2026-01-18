"""
Cognito LLM Router - Phase 4a
Abstracts model selection to support "Thinking Models" (Groq) alongside "Fast Models" (Gemini).

Usage:
    router = LLMRouter()
    response = router.generate(prompt, mode='thinking')
"""

import os
import logging
import json
from enum import Enum
from typing import Dict, Any, Optional
from dotenv import load_dotenv
import google.generativeai as genai
from groq import Groq

# Load env vars
load_dotenv()

logger = logging.getLogger(__name__)

# Constants
GEMINI_MODEL_FAST = "gemini-2.0-flash-lite-preview-02-05"

# Thinking Models (User Specified Exact Strings)
MODEL_GPT_OSS_20B = "openai/gpt-oss-20b"
MODEL_LLAMA_4_SCOUT = "meta-llama/llama-4-scout-17b-16e-instruct"
MODEL_LLAMA_4_MAVERICK = "meta-llama/llama-4-maverick-17b-128e-instruct"
MODEL_GPT_OSS_120B = "openai/gpt-oss-120b"

class ModelMode(Enum):
    FAST = "fast"
    BATTLE = "battle"
    
    # Specific Thinking Models
    GPT_20B = "gpt-oss-20b"
    LLAMA_4_SCOUT = "llama-4-scout"
    LLAMA_4_MAVERICK = "llama-4-maverick"
    GPT_120B = "gpt-oss-120b"

class LLMRouter:
    def __init__(self):
        # ... validation code ...
        self.gemini_key = os.getenv('GOOGLE_AI_API_KEY')
        if self.gemini_key:
            genai.configure(api_key=self.gemini_key)
            self.gemini_model = genai.GenerativeModel(GEMINI_MODEL_FAST)
        else:
            logger.warning("GEMINI_API_KEY not found")

        self.groq_key = os.getenv('GROQ_API_KEY')
        self.groq_client = None
        if self.groq_key:
            self.groq_client = Groq(api_key=self.groq_key)
        else:
            logger.warning("GROQ_API_KEY not found")

    def generate(self, prompt: str, system_prompt: str = None, mode: str = 'fast') -> Dict[str, Any]:
        """
        Generate response using the selected model mode.
        """
        try:
            mode_enum = ModelMode(mode)
        except ValueError:
            logger.warning(f"Unknown mode '{mode}', defaulting to fast")
            mode_enum = ModelMode.FAST

        # Route to appropriate provider
        if mode_enum == ModelMode.FAST:
            return self._generate_gemini(prompt, system_prompt)
            
        elif mode_enum == ModelMode.BATTLE:
            return self._generate_battle(prompt, system_prompt)
            
        elif mode_enum in [ModelMode.GPT_20B, ModelMode.LLAMA_4_SCOUT, ModelMode.LLAMA_4_MAVERICK, ModelMode.GPT_120B]:
            if not self.groq_client:
                return {"error": "Groq client not initialized", "model": "groq"}
                
            # Select specific model
            model_id = MODEL_LLAMA_4_SCOUT  # Default fallback
            if mode_enum == ModelMode.GPT_20B:
                model_id = MODEL_GPT_OSS_20B
            elif mode_enum == ModelMode.LLAMA_4_SCOUT:
                model_id = MODEL_LLAMA_4_SCOUT
            elif mode_enum == ModelMode.LLAMA_4_MAVERICK:
                model_id = MODEL_LLAMA_4_MAVERICK
            elif mode_enum == ModelMode.GPT_120B:
                model_id = MODEL_GPT_OSS_120B
                
            return self._generate_groq(prompt, system_prompt, model_id)
            
        return self._generate_gemini(prompt, system_prompt)

    def _generate_gemini(self, prompt: str, system_prompt: str = None) -> Dict[str, Any]:
        """Run generation via Gemini."""
        try:
            full_prompt = prompt
            if system_prompt:
                model = genai.GenerativeModel(
                    GEMINI_MODEL_FAST,
                    system_instruction=system_prompt
                )
            else:
                model = self.gemini_model

            response = model.generate_content(
                prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            
            # Parse JSON
            try:
                content = json.loads(response.text)
                # Handle list response (sometime models wrap in [...])
                if isinstance(content, list) and len(content) > 0:
                    content = content[0]
            except json.JSONDecodeError:
                content = {"raw_text": response.text, "error": "Failed to parse JSON"}

            return {
                "content": content,
                "model": GEMINI_MODEL_FAST,
                "provider": "google",
                "mode": "fast"
            }
        except Exception as e:
            logger.error(f"Gemini generation failed: {e}")
            return {"error": str(e), "model": GEMINI_MODEL_FAST}

    def _generate_groq(self, prompt: str, system_prompt: str = None, model: str = MODEL_LLAMA_4_SCOUT) -> Dict[str, Any]:
        """Run generation via Groq using specified model."""
        try:
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            
            messages.append({"role": "user", "content": prompt})

            completion = self.groq_client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.1,
                response_format={"type": "json_object"}
            )

            response_text = completion.choices[0].message.content
            
            try:
                content = json.loads(response_text)
                # Handle list response
                if isinstance(content, list) and len(content) > 0:
                    content = content[0]
            except json.JSONDecodeError:
                content = {"raw_text": response_text, "error": "Failed to parse JSON"}

            return {
                "content": content,
                "model": model,
                "provider": "groq",
                "mode": "thinking"
            }
        except Exception as e:
            logger.error(f"Groq generation failed ({model}): {e}")
            return {"error": str(e), "model": model}
            
    def _generate_battle(self, prompt: str, system_prompt: str = None) -> Dict[str, Any]:
        """Run both and return comparison."""
        fast_result = self._generate_gemini(prompt, system_prompt)
        thinking_result = self._generate_groq(prompt, system_prompt) # Use default thinking for battle helper
        
        return {
            "fast": fast_result,
            "thinking": thinking_result,
            "mode": "battle"
        }
