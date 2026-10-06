<?php
declare(strict_types=1);

$root = dirname(__DIR__);
$helper = $root . '/application/helpers/dts_admin_helper.php';
$files = [
    $helper,
    $root . '/application/models/User_admin_model.php',
    $root . '/application/models/Rbac_model.php',
    $root . '/application/models/Registration_model.php',
    $root . '/application/controllers/Users.php',
    $root . '/application/controllers/Roles.php',
    $root . '/application/controllers/Permissions.php',
    $root . '/application/controllers/Role_permissions.php',
    $root . '/application/controllers/Registrations.php',
];
foreach ($files as $file) {
    if (!is_file($file)) {
        fwrite(STDERR, 'FAIL missing ' . basename($file) . PHP_EOL);
        exit(1);
    }
}
define('BASEPATH', $root . '/system/');
require_once $helper;

function r_assert($condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "FAIL {$message}" . PHP_EOL);
        exit(1);
    }
}

r_assert(dts_is_administrative_role('Admin') === true, 'canonical Admin recognized');
r_assert(dts_is_administrative_role(' Admin ') === true, 'Admin whitespace normalized');
r_assert(dts_is_administrative_role('Administrator') === false, 'non-canonical admin-like role rejected');

$reference = dts_registration_reference();
r_assert(preg_match('/^REG-[A-F0-9]{16}$/', $reference) === 1, 'registration reference uses 16 uppercase hex chars');

$userModel = file_get_contents($root . '/application/models/User_admin_model.php');
r_assert(strpos($userModel, 'document_revisions') !== false, 'user deletion checks revision history');
r_assert(strpos($userModel, 'last administrator') !== false, 'last administrator deletion protected');

$registrationModel = file_get_contents($root . '/application/models/Registration_model.php');
r_assert(strpos($registrationModel, 'FOR UPDATE') !== false, 'registration review row is locked');
r_assert(strpos($registrationModel, 'trans_start') !== false, 'registration approval is transactional');
r_assert(strpos($registrationModel, "'PENDING'") !== false, 'pending registration state preserved');

$usersController = file_get_contents($root . '/application/controllers/Users.php');
r_assert(strpos($usersController, 'user-accounts.view') !== false, 'users view permission preserved');
r_assert(strpos($usersController, 'user-accounts.manage') !== false, 'users manage permission preserved');

$rbac = file_get_contents($root . '/application/controllers/Role_permissions.php');
r_assert(strpos($rbac, 'roles-permissions.manage') !== false, 'RBAC manage permission preserved');

echo "PASS rbac_contract_test\n";
