<?php
defined('BASEPATH') OR exit('No direct script access allowed');

if (!function_exists('dts_is_administrative_role')) {
    function dts_is_administrative_role($roleName): bool
    {
        return trim((string) $roleName) === 'Admin';
    }
}

if (!function_exists('dts_registration_reference')) {
    function dts_registration_reference(): string
    {
        return 'REG-' . strtoupper(bin2hex(random_bytes(8)));
    }
}
