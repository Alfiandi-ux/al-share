"""
Al-share Network Utilities
Detects local WLAN / LAN IP addresses and available network interfaces.
"""

import socket
import subprocess
import re
import os

def get_local_ip_addresses():
    """
    Returns a list of unique IPv4 addresses for local WLAN / LAN connections.
    """
    ip_list = []
    
    # Method 1: Connect a dummy UDP socket (does not send real packets)
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        # 8.8.8.8 does not need to be reachable; kernel picks the outgoing interface IP
        s.connect(('8.8.8.8', 80))
        primary_ip = s.getsockname()[0]
        s.close()
        if primary_ip and not primary_ip.startswith('127.'):
            ip_list.append(primary_ip)
    except Exception:
        pass

    # Method 2: Inspect all hostnames
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith('127.') and ip not in ip_list:
                ip_list.append(ip)
    except Exception:
        pass

    # Method 3: Parse /proc/net/fib_trie or ifconfig / ip route if available
    try:
        if os.path.exists('/proc/net/fib_trie'):
            with open('/proc/net/fib_trie', 'r') as f:
                content = f.read()
                matches = re.findall(r'(\d+\.\d+\.\d+\.\d+)/32 host LOCAL', content)
                for ip in matches:
                    if not ip.startswith('127.') and ip not in ip_list:
                        ip_list.append(ip)
    except Exception:
        pass

    # Fallback if nothing found
    if not ip_list:
        ip_list.append('127.0.0.1')

    # Sort so standard LAN ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x) come first
    def lan_priority(ip):
        if ip.startswith('192.168.'):
            return 0
        if ip.startswith('10.'):
            return 1
        if ip.startswith('172.'):
            return 2
        return 3

    ip_list.sort(key=lan_priority)
    return ip_list

def find_available_port(start_port=8080, max_attempts=50):
    """
    Finds the first available TCP port starting from start_port.
    """
    for port in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(('0.0.0.0', port))
                return port
            except OSError:
                continue
    return start_port
