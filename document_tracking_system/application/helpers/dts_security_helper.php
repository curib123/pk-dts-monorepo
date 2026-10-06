<?php
defined('BASEPATH') OR exit('No direct script access allowed');

if (!function_exists('dts_page')) {
    function dts_page($value): int
    {
        $page = filter_var($value, FILTER_VALIDATE_INT, array('options' => array('min_range' => 1)));
        return $page === false ? 1 : (int) $page;
    }
}

if (!function_exists('dts_limit')) {
    function dts_limit($value): int
    {
        $limit = filter_var($value, FILTER_VALIDATE_INT, array('options' => array('min_range' => 1)));
        if ($limit === false) {
            return 10;
        }

        return min((int) $limit, 100);
    }
}

if (!function_exists('dts_id_string')) {
    function dts_id_string($value): ?string
    {
        if (is_int($value) && $value > 0) {
            return (string) $value;
        }

        if (!is_string($value)) {
            return null;
        }

        $value = trim($value);
        return preg_match('/^[1-9][0-9]*$/', $value) === 1 ? $value : null;
    }
}

if (!function_exists('dts_escape')) {
    function dts_escape($value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
    }
}
