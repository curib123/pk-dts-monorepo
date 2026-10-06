<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= dts_escape(isset($pageTitle) ? $pageTitle . ' · ' . $applicationName : $applicationName) ?></title>
    <link rel="stylesheet" href="<?= dts_escape(base_url('assets/css/app.css')) ?>">
</head>
<body>
<div class="app-shell">
    <header class="app-header">
        <a class="brand" href="<?= dts_escape(site_url('/')) ?>">PK DTS</a>
        <?php if (!empty($currentUser)): ?>
            <div class="user-summary">
                <span><?= dts_escape(trim(($currentUser['firstname'] ?? '') . ' ' . ($currentUser['lastname'] ?? ''))) ?></span>
                <a href="<?= dts_escape(site_url('auth/logout')) ?>">Sign out</a>
            </div>
        <?php endif; ?>
    </header>
    <div class="app-body">
        <?php if (!empty($currentUser)): ?>
            <aside class="app-sidebar" aria-label="Primary navigation">
                <nav>
                    <a href="<?= dts_escape(site_url('/')) ?>">Dashboard</a>
                    <?php foreach (($navigation ?? array()) as $item): ?>
                        <a href="<?= dts_escape(site_url($item['path'] ?? '')) ?>"><?= dts_escape($item['label'] ?? '') ?></a>
                    <?php endforeach; ?>
                </nav>
            </aside>
        <?php endif; ?>
        <main class="app-main">
            <?php $this->load->view('partials/flash'); ?>
            <?php $this->load->view($contentView, get_defined_vars()); ?>
        </main>
    </div>
</div>
<script src="<?= dts_escape(base_url('assets/js/app.js')) ?>"></script>
</body>
</html>
