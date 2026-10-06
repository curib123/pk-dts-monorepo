<?php
declare(strict_types=1);

$root = dirname(__DIR__);
$helper = $root . '/application/helpers/dts_auth_helper.php';
$model = $root . '/application/models/User_model.php';
$controller = $root . '/application/controllers/Auth.php';

foreach ([$helper, $model, $controller] as $file) {
    if (!is_file($file)) {
        fwrite(STDERR, 'FAIL missing ' . basename($file) . PHP_EOL);
        exit(1);
    }
}

define('BASEPATH', $root . '/system/');
require_once $helper;

function a_assert($condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "FAIL {$message}" . PHP_EOL);
        exit(1);
    }
}

a_assert(dts_normalize_username('  Admin.User ') === 'admin.user', 'username normalized');
a_assert(dts_valid_username('admin_01') === true, 'valid username accepted');
a_assert(dts_valid_username('bad space') === false, 'whitespace username rejected');
a_assert(dts_valid_username('') === false, 'empty username rejected');

$hash = password_hash('secret123', PASSWORD_BCRYPT);
$nodeBcryptHash = '$2b$' . substr($hash, 4);
a_assert(dts_password_verify('secret123', $nodeBcryptHash) === true, 'Node bcrypt $2b$ hash verifies in PHP');
a_assert(dts_password_verify('wrong', $nodeBcryptHash) === false, 'wrong password rejected');

$user = dts_authenticated_user([
    'user_id' => '9223372036854775807',
    'username' => 'admin',
    'firstname' => 'Admin',
    'lastname' => 'User',
    'require_password_change' => true,
    'role_id' => '1',
    'role_name' => 'Administrator',
], [
    ['permission_id' => '2', 'permission_name' => 'documents.view', 'module_key' => 'documents', 'module_label' => 'Documents', 'action_key' => 'view', 'action_label' => 'View', 'description' => null],
]);

a_assert($user['user_id'] === '9223372036854775807', 'BigInt user id remains string');
a_assert($user['role']['permissions'] === ['documents.view'], 'permission names projected');
a_assert($user['require_password_change'] === true, 'password change flag preserved');

$controllerSource = file_get_contents($controller);
a_assert(strpos($controllerSource, 'sess_regenerate_destroy') !== false || strpos($controllerSource, 'sess_regenerate') !== false, 'login regenerates session id');
a_assert(strpos($controllerSource, 'change_password') !== false, 'password change route implemented');
a_assert(strpos($controllerSource, "userdata('dts_user'") !== false || strpos($controllerSource, "set_userdata('dts_user'") !== false, 'dts_user session key used');

echo "PASS auth_contract_test\n";
