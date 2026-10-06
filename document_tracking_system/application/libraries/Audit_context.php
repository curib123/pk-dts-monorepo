<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Audit_context
{
    public function from_server(array $server): array
    {
        $method = strtoupper((string) ($server['REQUEST_METHOD'] ?? 'GET'));
        $path = (string) ($server['REQUEST_URI'] ?? '/');
        $ip = (string) ($server['REMOTE_ADDR'] ?? '');
        $userAgent = (string) ($server['HTTP_USER_AGENT'] ?? '');

        return array(
            'method' => substr($method, 0, 10),
            'path' => substr($path, 0, 500),
            'ip_address' => $ip === '' ? null : substr($ip, 0, 100),
            'user_agent' => $userAgent === '' ? null : substr($userAgent, 0, 500),
        );
    }
}
