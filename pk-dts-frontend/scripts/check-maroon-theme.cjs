const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const fail = (message) => {
    console.error(`\nTheme regression check failed: ${message}\n`);
    process.exitCode = 1;
};

const preset = read('src/app/theme/brand-preset.ts');
const globalStyles = read('src/assets/styles.scss');
const panelStyles = read('src/app/panel/panel-layout.component.scss');
const settingsService = read('src/app/shared/services/system-settings.service.ts');

if (!/BRAND_DEEP_RED\s*=\s*['"]#800000['"]/.test(preset)) {
    fail('brand-preset.ts must keep #800000 as the single primary deep-maroon brand color.');
}

for (const token of ['--brand-primary', '--brand-primary-hover', '--brand-primary-active', '--brand-primary-deep', '--brand-soft', '--brand-soft-strong']) {
    if (!globalStyles.includes(token)) fail(`global styles are missing centralized token ${token}.`);
}

for (const alias of [
    '--dts-accent: var(--brand-primary)',
    '--dts-accent-deep: var(--brand-primary-deep)',
    '--dts-accent-soft: var(--brand-soft-strong)'
]) {
    if (!globalStyles.includes(alias)) fail(`global styles must map legacy compatibility token ${alias} to the central brand palette.`);
}

const themeOptionsMatch = settingsService.match(/export const COLOR_THEME_OPTIONS = \[(.*?)\] as const;/s);
if (!themeOptionsMatch) {
    fail('COLOR_THEME_OPTIONS could not be found.');
} else {
    const ids = [...themeOptionsMatch[1].matchAll(/id:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
    if (ids.length !== 1 || ids[0] !== 'default') {
        fail(`appearance settings must expose exactly one theme (default deep maroon); found: ${ids.join(', ') || 'none'}.`);
    }
    if (!settingsService.includes("from '@/app/theme/brand-preset'")) fail('system settings must reuse the centralized brand preset rather than duplicate maroon hex values.');
    if (!themeOptionsMatch[1].includes('accent: BRAND_DEEP_RED')) fail('the remaining appearance theme must use BRAND_DEEP_RED as its accent.');
    if (!themeOptionsMatch[1].includes('deep: MAROON_PALETTE[800]')) fail('the remaining appearance theme must derive its deep shade from MAROON_PALETTE.');
    if (!themeOptionsMatch[1].includes('soft: MAROON_PALETTE[100]')) fail('the remaining appearance theme must derive its soft shade from MAROON_PALETTE.');
}

for (const legacyHex of ['#dc2626', '#991b1b']) {
    if (panelStyles.toLowerCase().includes(legacyHex)) fail(`panel-layout.component.scss still contains legacy accent ${legacyHex}.`);
}

for (const token of ['var(--brand-primary)', 'var(--brand-primary-deep)', 'var(--brand-soft)']) {
    if (!panelStyles.includes(token)) fail(`panel layout must consume shared token ${token}.`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log('Centralized deep-maroon theme regression check passed.');
