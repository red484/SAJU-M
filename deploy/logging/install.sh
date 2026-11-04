#!/usr/bin/env bash
set -euo pipefail
config_dir=$(cd -- "$(dirname -- "$0")" && pwd)
[[ $(id -u) == 0 ]] || { echo 'Run this script as root' >&2; exit 1; }
command -v rsyslogd >/dev/null
command -v logrotate >/dev/null
systemctl is-enabled logrotate.timer >/dev/null
systemctl is-active --quiet logrotate.timer
install -d -o syslog -g adm -m 0750 /var/log/saju
config_file=/etc/rsyslog.d/25-saju.conf
if ! cmp -s "$config_dir/rsyslog.conf" "$config_file" || [[ ! -S /var/spool/rsyslog/saju.sock ]]; then
    previous_config=$(mktemp)
    had_config=false
    if [[ -f $config_file ]]; then cp "$config_file" "$previous_config"; had_config=true; fi
    restore_config() {
        if $had_config; then cp "$previous_config" "$config_file"; else rm -f "$config_file"; fi
        rm -f "$previous_config"
    }
    install -m 0644 "$config_dir/rsyslog.conf" "$config_file"
    if ! rsyslogd -N1; then restore_config; exit 1; fi
    if ! systemctl restart rsyslog || [[ ! -S /var/spool/rsyslog/saju.sock ]]; then
        restore_config
        systemctl restart rsyslog
        exit 1
    fi
    rm -f "$previous_config"
fi
rotation_check=$(mktemp)
install -m 0644 "$config_dir/logrotate.conf" "$rotation_check"
if ! logrotate --debug "$rotation_check"; then rm -f "$rotation_check"; exit 1; fi
install -m 0644 "$rotation_check" /etc/logrotate.d/saju
rm -f "$rotation_check"
systemctl is-active --quiet rsyslog
