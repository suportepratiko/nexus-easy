#!/usr/bin/env python3
"""Lista modelos Gemini disponíveis para a API key. Uso: python -m backend.scripts.list_gemini_models"""
import os
import sys

# Adiciona o backend ao path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.gemini_strategy import GEMINI_API_KEY
import google.generativeai as genai

genai.configure(api_key=GEMINI_API_KEY, transport="rest")
print("Modelos com generateContent:")
for m in genai.list_models():
    methods = m.supported_generation_methods or []
    if "generateContent" in methods:
        print(f"  {m.name}")
