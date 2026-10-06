<?php
declare(strict_types=1);

$root = dirname(__DIR__);
$helper = $root . '/application/helpers/dts_security_helper.php';
$authorization = $root . '/application/libraries/Dts_authorization.php';
$auditContext = $root . '/application/libraries/Audit_context.php';

foreach ([$helper, $authorization, $auditContext] as $file) {
    if (!is_file($file)) {
        fwrite(STDERR, "FAIL missing " . basename($file) . PHP_EOL);
        exit(1);
    }
}

if (!defined('BASEPATH')) {
    define('BASEPATH', $root . '/system/');
}

require_once $helper;
require_once $authorization;
require_once $auditContext;

function t_assert($condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "FAIL {$message}" . PHP_EOL);
        exit(1);
    }
}

t_assert(dts_page(null) === 1, 'null page defaults to 1');
t_assert(dts_page('0') === 1, 'page less than 1 clamps to 1');
t_assert(dts_page('7') === 7, 'valid page preserved');
t_assert(dts_limit(null) === 10, 'null limit defaults to 10');
t_assert(dts_limit('0') === 10, 'non-positive limit defaults to 10');
t_assert(dts_limit('25') === 25, 'valid limit preserved');
t_assert(dts_limit('500') === 100, 'limit is capped at 100');
t_assert(dts_id_string('9223372036854775807') === '9223372036854775807', 'BigInt string preserved exactly');
t_assert(dts_id_string('1e3') === null, 'scientific notation rejected for ids');
t_assert(dts_id_string('-1') === null, 'negative id rejected');

$auth = new Dts_authorization();
$user = [
    'user_id' => '42',
    'role' => [
        'role_name' => 'Reviewer',
        'permissions' => ['documents.view', 'documents.approve'],
    ],
];

t_assert($auth->is_authenticated($user) === true, 'user with id is authenticated');
t_assert($auth->is_authenticated(null) === false, 'null user is unauthenticated');
t_assert($auth->allows($user, 'documents.view') === true, 'existing permission allowed');
t_assert($auth->allows($user, 'documents.delete') === false, 'missing permission denied');
t_assert($auth->allows(null, 'documents.view') === false, 'anonymous permission denied');

$audit = new Audit_context();
$context = $audit->from_server([
    'REQUEST_METHOD' => 'POST',
    'REQUEST_URI' => '/documents/123?tab=history',
    'REMOTE_ADDR' => '127.0.0.1',
    'HTTP_USER_AGENT' => str_repeat('A', 600),
]);
t_assert($context['method'] === 'POST', 'audit method captured');
t_assert($context['path'] === '/documents/123?tab=history', 'audit path captured');
t_assert($context['ip_address'] === '127.0.0.1', 'audit ip captured');
t_assert(strlen($context['user_agent']) === 500, 'audit user agent capped to schema size');

echo "PASS security_primitives_test\n";
