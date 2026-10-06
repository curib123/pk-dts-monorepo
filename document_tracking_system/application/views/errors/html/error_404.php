<?php defined('BASEPATH') OR exit('No direct script access allowed'); ?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>404 — PK DTS</title>
    <style>body{font-family:system-ui,sans-serif;margin:0;background:#f6f7fb;color:#182230}.wrap{max-width:44rem;margin:12vh auto;padding:2rem}.code{font-size:3rem;font-weight:700;margin:0}.message{color:#536174}</style>
</head>
<body>
<main class="wrap">
    <p class="code">404</p>
    <h1><?= htmlspecialchars(isset($heading) ? $heading : 'Page Not Found', ENT_QUOTES, 'UTF-8') ?></h1>
    <div class="message"><?= isset($message) ? $message : 'The requested page could not be found.' ?></div>
</main>
</body>
</html>
