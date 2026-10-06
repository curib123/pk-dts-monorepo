<?php
declare(strict_types=1);

$root = dirname(__DIR__);
require $root . '/bootstrap/env.php';

define('BASEPATH', $root . '/system/');
define('APPPATH', $root . '/application/');
define('ENVIRONMENT', 'testing');

function contract_assert($condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

putenv('APP_URL=http://example.test/dts');
putenv('SESSION_DRIVER=files');
putenv('DB_HOST=db.internal');
putenv('DB_PORT=5544');
putenv('DB_NAME=dts_test');
putenv('DB_USER=dts_user');
putenv('DB_PASSWORD=');
putenv('DB_DRIVER=postgre');

$configFile = $root . '/application/config/config.php';
$dbFile = $root . '/application/config/database.php';
$routeFile = $root . '/application/config/routes.php';
$autoloadFile = $root . '/application/config/autoload.php';

foreach ([$configFile, $dbFile, $routeFile, $autoloadFile] as $file) {
    if (!is_file($file)) {
        fwrite(STDERR, "FAIL: missing config file {$file}\n");
        exit(1);
    }
}

require $configFile;
require $dbFile;
require $routeFile;
require $autoloadFile;

contract_assert(($config['base_url'] ?? null) === 'http://example.test/dts/', 'base_url should come from APP_URL and end with one slash');
contract_assert(($config['sess_driver'] ?? null) === 'files', 'session driver should default/map to files');
contract_assert(($db['default']['dbdriver'] ?? null) === 'postgre', 'database driver should be postgre');
contract_assert(($db['default']['hostname'] ?? null) === 'db.internal', 'DB_HOST should map to hostname');
contract_assert(($db['default']['port'] ?? null) === '5544', 'DB_PORT should map to port');
contract_assert(($db['default']['database'] ?? null) === 'dts_test', 'DB_NAME should map to database');
contract_assert(($db['default']['username'] ?? null) === 'dts_user', 'DB_USER should map to username');
contract_assert(array_key_exists('password', $db['default']) && $db['default']['password'] === '', 'empty DB_PASSWORD should remain valid');
contract_assert(($route['default_controller'] ?? null) === 'home', 'default route should be home');
contract_assert(!in_array('database', $autoload['libraries'] ?? [], true), 'database must not be globally autoloaded');

$requiredApplicationFiles = array(
    $root . '/application/controllers/Home.php',
    $root . '/application/core/MY_Controller.php',
    $root . '/application/core/MY_Model.php',
    $root . '/application/views/migration/home.php',
);
foreach ($requiredApplicationFiles as $file) {
    contract_assert(is_file($file), 'required application file missing: ' . $file);
}
$homeSource = file_get_contents($root . '/application/controllers/Home.php');
contract_assert($homeSource !== false, 'Home controller should be readable');
contract_assert(strpos($homeSource, 'load->database') === false, 'Home controller must not load the database');

echo "PASS config_contract_test\n";
