<?php
defined('BASEPATH') OR exit('No direct script access allowed');

if (!function_exists('dts_numeric_to_location_code')) {
    function dts_numeric_to_location_code($sequenceNumber): string
    {
        $number = filter_var($sequenceNumber, FILTER_VALIDATE_INT, array('options' => array('min_range' => 1)));
        if ($number === false) {
            throw new InvalidArgumentException('Location code sequence numbers must be positive integers.');
        }
        $code = '';
        while ($number > 0) {
            $number -= 1;
            $code = chr(65 + ($number % 26)) . $code;
            $number = intdiv($number, 26);
        }
        return $code;
    }
}

if (!function_exists('dts_location_code_to_numeric')) {
    function dts_location_code_to_numeric($code): int
    {
        $code = strtoupper(trim((string) $code));
        if (!preg_match('/^[A-Z]+$/', $code)) {
            throw new InvalidArgumentException('Location codes must use uppercase letters A-Z only.');
        }
        $value = 0;
        for ($i = 0, $len = strlen($code); $i < $len; $i++) {
            $value = ($value * 26) + (ord($code[$i]) - 64);
        }
        return $value;
    }
}
