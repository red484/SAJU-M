#!/usr/bin/env bash
set -euo pipefail
umask 077
config_dir=$(cd -- "$(dirname -- "$0")" && pwd)
if [[ ! -e /etc/nginx/sites-enabled/saju ]]; then
    echo 'No dedicated local SAJU host proxy; external proxy logs require separate review.'
    exit 0
fi
vhost=$(readlink -f /etc/nginx/sites-enabled/saju)
[[ $vhost == /etc/nginx/sites-available/* || $vhost == /etc/nginx/sites-enabled/* ]] || { echo 'Unexpected virtual host path' >&2; exit 1; }
format_file=/etc/nginx/conf.d/25-saju-log-format.conf
for logfile in /var/log/saju/host-access.log /var/log/saju/host-error.log; do
    if [[ ! -e $logfile ]]; then install -o www-data -g adm -m 0640 /dev/null "$logfile"; fi
    chown www-data:adm "$logfile"
    chmod 0640 "$logfile"
done
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
python3 "$config_dir/configure-host-nginx.py" < "$vhost" > "$scratch/vhost"
if cmp -s "$scratch/vhost" "$vhost" && cmp -s "$config_dir/nginx-http.conf" "$format_file"; then
    echo 'Host proxy logging already uses the 30-day service files; no reload.'
    exit 0
fi
cp -p "$vhost" "$scratch/previous-vhost"
had_format=false
if [[ -f $format_file ]]; then cp -p "$format_file" "$scratch/previous-format"; had_format=true; fi
restore_config() {
    cp -p "$scratch/previous-vhost" "$vhost"
    if $had_format; then cp -p "$scratch/previous-format" "$format_file"; else rm -f "$format_file"; fi
}
install -m 0644 "$scratch/vhost" "$vhost"
install -m 0644 "$config_dir/nginx-http.conf" "$format_file"
if ! nginx -t; then restore_config; exit 1; fi
if ! systemctl reload nginx; then restore_config; nginx -t && systemctl reload nginx; exit 1; fi
# The nginx master creates/opens the files before workers use them.
chmod 0640 /var/log/saju/host-access.log /var/log/saju/host-error.log
echo 'Host proxy logs now use service-specific 30-day rotation.'
