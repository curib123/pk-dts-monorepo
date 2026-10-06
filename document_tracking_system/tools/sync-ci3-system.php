<?php
declare(strict_types=1);

$root = dirname(__DIR__);
$source = $root . '/vendor/codeigniter/framework/system';
$target = $root . '/system';

if (!is_dir($source)) {
    fwrite(STDERR, "CodeIgniter system source not found at {$source}. Run composer install first.\n");
    exit(1);
}

if (!is_dir($target) && !mkdir($target, 0775, true) && !is_dir($target)) {
    fwrite(STDERR, "Unable to create target system directory.\n");
    exit(1);
}

$clear = static function (string $directory) use (&$clear): void {
    $items = scandir($directory);
    if ($items === false) {
        throw new RuntimeException("Unable to read {$directory}");
    }
    foreach ($items as $item) {
        if ($item === '.' || $item === '..' || $item === '.gitkeep') {
            continue;
        }
        $path = $directory . DIRECTORY_SEPARATOR . $item;
        if (is_dir($path) && !is_link($path)) {
            $clear($path);
            if (!rmdir($path)) {
                throw new RuntimeException("Unable to remove {$path}");
            }
        } elseif (!unlink($path)) {
            throw new RuntimeException("Unable to remove {$path}");
        }
    }
};

$copy = static function (string $from, string $to) use (&$copy): void {
    if (!is_dir($to) && !mkdir($to, 0775, true) && !is_dir($to)) {
        throw new RuntimeException("Unable to create {$to}");
    }
    $items = scandir($from);
    if ($items === false) {
        throw new RuntimeException("Unable to read {$from}");
    }
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $sourcePath = $from . DIRECTORY_SEPARATOR . $item;
        $targetPath = $to . DIRECTORY_SEPARATOR . $item;
        if (is_dir($sourcePath) && !is_link($sourcePath)) {
            $copy($sourcePath, $targetPath);
        } elseif (!copy($sourcePath, $targetPath)) {
            throw new RuntimeException("Unable to copy {$sourcePath}");
        }
    }
};

try {
    $clear($target);
    $copy($source, $target);
    echo "Synced CodeIgniter system directory.\n";
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . "\n");
    exit(1);
}
