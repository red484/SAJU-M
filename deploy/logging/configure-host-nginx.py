"""Add service-specific logs only to the dedicated SAJU virtual host."""
import re
import sys

source = sys.stdin.read()
names = re.findall(r'^\s*server_name\s+([^;]+);', source, re.M)
if not names or any(name.strip() != 'saju.ashwoodfriends.com' for name in names):
    raise SystemExit('Expected a dedicated saju.ashwoodfriends.com virtual host')
access = 'access_log /var/log/saju/host-access.log saju_retention;'
error = 'error_log /var/log/saju/host-error.log;'
if access in source or error in source:
    directives = [line.strip() for line in source.splitlines() if re.match(r'^\s*(access_log|error_log)\s', line)]
    if source.count(access) != len(names) or source.count(error) != len(names) or len(directives) != 2 * len(names) or set(directives) != {access, error}:
        raise SystemExit('Incomplete service log configuration')
    sys.stdout.write(source)
else:
    if re.search(r'^\s*(access_log|error_log)\s', source, re.M):
        raise SystemExit('Existing custom logs require manual review')
    for line in source.splitlines(keepends=True):
        sys.stdout.write(line)
        if re.match(r'^\s*server_name\s+saju\.ashwoodfriends\.com\s*;', line):
            sys.stdout.write('    # Service-scoped 30-day retention\n    ' + access + '\n    ' + error + '\n')
