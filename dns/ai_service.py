import json
from dns.models import SystemSetting

def get_ai_config():
    """Retrieve the AI configuration from the database."""
    enabled = SystemSetting.objects.filter(key='ai_enabled', value='true').exists()
    provider = SystemSetting.objects.filter(key='ai_provider').values_list('value', flat=True).first()
    api_key = SystemSetting.objects.filter(key='ai_api_key').values_list('value', flat=True).first()
    return enabled, provider, api_key

def ask_ai(system_prompt: str, user_prompt: str) -> str:
    """Send a prompt to the configured AI provider. Returns string response or throws ValueError."""
    enabled, provider, api_key = get_ai_config()
    if not enabled or not provider or not api_key:
        raise ValueError("AI Integration is not configured or is disabled.")

    if provider == 'openai':
        import openai
        client = openai.OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        )
        return response.choices[0].message.content

    elif provider == 'anthropic':
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=1024,
            system=system_prompt,
            messages=[
                {"role": "user", "content": user_prompt}
            ]
        )
        return response.content[0].text

    elif provider == 'gemini':
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash', system_instruction=system_prompt)
        response = model.generate_content(user_prompt)
        return response.text

    else:
        raise ValueError(f"Unsupported AI Provider: {provider}")

def generate_app_domains(app_name: str) -> list:
    """Generate a list of domains for a given application context."""
    system_prompt = (
        "You are a network security expert specializing in DNS blocklists. "
        "The user will provide the name of an application (e.g. 'TikTok', 'Disney+'). "
        "You must return ONLY a raw JSON array of strings representing the domains and CDNs "
        "used by that application. Do not include markdown formatting, backticks, or any other text. "
        "Example: [\"netflix.com\", \"nflxext.com\", \"nflxvideo.net\"]"
    )
    user_prompt = f"Application: {app_name}"
    
    response_text = ask_ai(system_prompt, user_prompt)
    try:
        # Strip any accidental markdown formatting
        clean_text = response_text.replace("```json", "").replace("```", "").strip()
        domains = json.loads(clean_text)
        if isinstance(domains, list):
            return domains
        return []
    except Exception as e:
        raise ValueError(f"AI returned malformed data: {response_text}") from e
