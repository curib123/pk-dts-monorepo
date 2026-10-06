<?php
declare(strict_types=1);

$bootstrap = dirname(__DIR__) . '/bootstrap/env.php';
if (!is_file($bootstrap)) {
    fwrite(STDERR, "FAIL: bootstrap/env.php does not exist\n");
    exit(1);
}
require $bootstrap;

function assert_same($expected, $actual, string $message): void
{
    if ($expected !== $actual) {
        fwrite(STDERR, "FAIL: {$message}. Expected " . var_export($expected, true) . ', got ' . var_export($actual, true) . "\n");
        exit(1);
    }
}

$tmp = tempnam(sys_get_temp_dir(), 'dts-env-');
file_put_contents($tmp, "\n# comment\nDTS_ALPHA=one\nDTS_QUOTED=\"two words\"\nDTS_SINGLE='three words'\nDTS_EXISTING=from-file\n");
putenv('DTS_EXISTING=from-process');

dts_load_env($tmp);
unlink($tmp);

assert_same('one', dts_env('DTS_ALPHA'), 'plain value should load');
assert_same('two words', dts_env('DTS_QUOTED'), 'double quotes should be trimmed');
assert_same('three words', dts_env('DTS_SINGLE'), 'single quotes should be trimmed');
assert_same('from-process', dts_env('DTS_EXISTING'), 'existing process variable must not be overwritten');
assert_same('fallback', dts_env('DTS_MISSING', 'fallback'), 'missing key should return default');

echo "PASS env_loader_test\n";
