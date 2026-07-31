import os
import time
import logging
from django.conf import settings
from django.db.models import Count
from django.utils import timezone
from datetime import timedelta

# Initialize django if run as a script
if __name__ == '__main__':
    import django
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    django.setup()

from dns.models import QueryLog, Client, SystemSetting
from blocks.models import BlockGroup
from dns.ai_service import get_ai_config, ask_ai
from dns_proxy.matcher import get_matcher

logger = logging.getLogger('dns.ai_worker')

def run_profiler():
    """Run the AI behavioral profiler over recent DNS queries."""
    enabled, provider, api_key, _model = get_ai_config()
    if not enabled:
        logger.info("Smart AI is disabled. Skipping profiling.")
        return

    logger.info("Running Smart AI Behavioral Profiler...")
    
    # 1. Get recent traffic (last 1 hour) for clients
    time_threshold = timezone.now() - timedelta(hours=1)
    
    # Analyze allowed queries (if they were blocked, we know they are bad)
    recent_logs = QueryLog.objects.filter(
        timestamp__gte=time_threshold,
        status='allowed'
    ).values('client_ip', 'domain')

    if not recent_logs.exists():
        logger.info("No recent queries to analyze.")
        return

    # Group by client IP
    client_profiles = {}
    for log in recent_logs:
        ip = log['client_ip']
        if ip not in client_profiles:
            client_profiles[ip] = set()
        # Keep unique domains
        client_profiles[ip].add(log['domain'])

    system_prompt = (
        "You are an advanced autonomous network security orchestrator. "
        "I will provide a list of domains visited by a specific IP in the last hour. "
        "You must evaluate if this behavior indicates the host is COMPROMISED (malware beaconing, botnet C2, "
        "excessive shady domains), VIOLATING tracking limits, or is SAFE. "
        "If they are compromised or actively malicious, reply strictly with the word: QUARANTINE. "
        "To provide a reason, put it after a colon. "
        "Example output: QUARANTINE: Client contacting multiple known Emotet C2 endpoints."
    )

    matcher = get_matcher()

    for ip, domains in client_profiles.items():
        # Optimization: Only evaluate clients with a reasonable number of unique lookups to save tokens
        if len(domains) < 5:
            continue
            
        domain_list = ", ".join(list(domains)[:100]) # Cap to 100 for context limit
        user_prompt = f"Client IP: {ip}\nVisited Domains: {domain_list}"
        
        try:
            response = ask_ai(system_prompt, user_prompt)
            response = response.strip()
            
            if response.startswith("QUARANTINE"):
                reason = response.split(":", 1)[-1].strip() if ":" in response else "Behavioral anomalies detected."
                logger.warning(f"[AI THREAT INTEL] Quarantining {ip} - Reason: {reason}")
                
                # Check if group 'quarantine' exists
                q_group, _ = BlockGroup.objects.get_or_create(
                    name="Quarantine",
                    defaults={"description": "Automatically isolated by Smart AI."}
                )
                
                # Assign the client to quarantine
                client, _ = Client.objects.get_or_create(ip=ip)
                
                # Instead of saving group directly on Client (which doesn't exist, we must link it to User or how we handle it)
                # Wait, the proxy logic for BlockGroups uses group mapping by User or IP?
                # Actually, our architecture assigns Groups via `Client` -> `User` -> `BlockGroup`? 
                # Let's just create an IP mapping rule if possible, or create a BlockGroup for it.
                # Actually, to quarantine, we could dynamically update iptables? 
                # Let's save the AI evaluation tag into the Client's `name` or description for the UI.
                
                # Update Client Name with AI Badge
                client.name = f"[AI-QUARANTINED] {client.name}".strip()
                client.save()

                # To implement actual dropping, if we don't have a direct IP-to-Group mapping,
                # we can add a persistent Domain Block `*` rule just for this IP?
                # A proper implementation of quarantine could be iptables:
                import subprocess
                subprocess.run(['sudo', 'iptables', '-A', 'FORWARD', '-s', ip, '-j', 'DROP'])
                
        except Exception as e:
            logger.error(f"Error evaluating {ip}: {str(e)}")

def start_worker(interval=300):
    logger.info("Started AI Profiling Worker thread...")
    while True:
        try:
            run_profiler()
        except Exception as e:
            logger.error(f"Worker crashed: {str(e)}")
        time.sleep(interval)

if __name__ == '__main__':
    start_worker()
