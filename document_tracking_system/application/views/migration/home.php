<?php defined('BASEPATH') OR exit('No direct script access allowed'); ?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= htmlspecialchars($applicationName, ENT_QUOTES, 'UTF-8') ?> — CI3 Migration</title>
    <link rel="stylesheet" href="<?= htmlspecialchars(base_url('assets/css/app.css'), ENT_QUOTES, 'UTF-8') ?>">
</head>
<body>
<main class="shell" data-ci3-status="active">
    <section class="card" aria-labelledby="migration-title">
        <p class="eyebrow">Migration workspace</p>
        <h1 id="migration-title"><?= htmlspecialchars($applicationName, ENT_QUOTES, 'UTF-8') ?></h1>
        <p class="lead"><?= htmlspecialchars($message, ENT_QUOTES, 'UTF-8') ?></p>
        <dl class="status-grid">
            <div>
                <dt>Framework</dt>
                <dd>CodeIgniter 3</dd>
            </div>
            <div>
                <dt>Environment</dt>
                <dd><?= htmlspecialchars($environment, ENT_QUOTES, 'UTF-8') ?></dd>
            </div>
            <div>
                <dt>Database</dt>
                <dd>Not required for this verification page</dd>
            </div>
        </dl>
        <p class="note">This branch contains setup only. No DTS business module has been migrated yet.</p>
    </section>
</main>
<script src="<?= htmlspecialchars(base_url('assets/js/app.js'), ENT_QUOTES, 'UTF-8') ?>" defer></script>
</body>
</html>
