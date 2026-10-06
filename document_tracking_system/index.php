
<?php

/*
|--------------------------------------------------------------------------
| Application Environment
|--------------------------------------------------------------------------
| No .env file is used.
| Configure the environment directly here or in application/config/config.php.
*/

$appEnvironment = 'production';

$allowedEnvironments = ['development', 'testing', 'production'];

if (!in_array($appEnvironment, $allowedEnvironments, true)) {
    $appEnvironment = 'production';
}

define('ENVIRONMENT', $appEnvironment);

switch (ENVIRONMENT) {
    case 'development':
        error_reporting(-1);
        ini_set('display_errors', '1');
        break;

    case 'testing':
    case 'production':
        ini_set('display_errors', '0');
        error_reporting(
            E_ALL
            & ~E_NOTICE
            & ~E_STRICT
            & ~E_USER_NOTICE
            & ~E_DEPRECATED
        );
        break;
}

$system_path = 'system';
$application_folder = 'application';
$view_folder = '';

if (($resolved = realpath($system_path)) !== false) {
    $system_path = $resolved . DIRECTORY_SEPARATOR;
} else {
    $system_path = rtrim($system_path, '/\\') . DIRECTORY_SEPARATOR;
}

if (!is_dir($system_path)) {
    http_response_code(500);
    exit('CodeIgniter system directory is missing. Run composer install.');
}

define('SELF', pathinfo(__FILE__, PATHINFO_BASENAME));
define('BASEPATH', $system_path);
define('FCPATH', __DIR__ . DIRECTORY_SEPARATOR);
define('SYSDIR', basename(BASEPATH));

if (is_dir($application_folder)) {
    $application_folder = realpath($application_folder) ?: $application_folder;
}

define(
    'APPPATH',
    rtrim($application_folder, '/\\') . DIRECTORY_SEPARATOR
);

define(
    'VIEWPATH',
    $view_folder !== ''
        ? rtrim((realpath($view_folder) ?: $view_folder), '/\\') . DIRECTORY_SEPARATOR
        : APPPATH . 'views' . DIRECTORY_SEPARATOR
);

require_once BASEPATH . 'core/CodeIgniter.php';
