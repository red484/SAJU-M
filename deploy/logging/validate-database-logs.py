"""Check a rendered Compose config without printing any environment values."""
import json
import sys

config = json.load(sys.stdin)
project, volume, image = sys.argv[1:]

def require(condition, message):
    if not condition:
        raise SystemExit(message)

require(config.get('name') == project, 'Database project changed')
require(set(config.get('services', {})) == {'saju-db'}, 'Unexpected database services')
service = config['services']['saju-db']
require(service.get('container_name') == 'saju-db', 'Database container changed')
require(service.get('image') == image, 'Database image changed')
mounts = [m for m in service.get('volumes', []) if m.get('target') == '/var/lib/postgresql/data']
require(len(mounts) == 1 and mounts[0].get('type') == 'volume', 'Database data mount changed')
source = mounts[0].get('source')
require(config.get('volumes', {}).get(source, {}).get('name') == volume, 'Database volume changed')
expected = {'driver': 'syslog', 'options': {
    'syslog-address': 'unixgram:///var/spool/rsyslog/saju.sock',
    'syslog-format': 'rfc5424micro', 'tag': 'saju-db', 'cache-disabled': 'true'}}
require(service.get('logging') == expected, 'Database logging does not match the retention policy')
print('PASS database image, volume and logging configuration')
