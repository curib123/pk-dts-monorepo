import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pagesRoot = path.join(root, 'src', 'app', 'panel', 'pages');
const excludedDirectories = new Set(['dashboard']);
const excludedFiles = new Set(['blank-section.page.ts']);
const forbiddenTemplateMarkers = [
  '<h1',
  'legacy-workspace-header',
  'access-hero',
  'page-heading',
  'hero-strip'
];

const failures = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) walk(path.join(directory, entry.name));
      continue;
    }

    if (!entry.name.endsWith('.page.ts') || excludedFiles.has(entry.name)) continue;
    const filePath = path.join(directory, entry.name);
    const source = fs.readFileSync(filePath, 'utf8');
    const templateUrl = source.match(/templateUrl:\s*['"]([^'"]+)['"]/);
    let template = '';

    if (templateUrl) {
      template = fs.readFileSync(path.resolve(path.dirname(filePath), templateUrl[1]), 'utf8');
    } else {
      const inline = source.match(/template:\s*`([\s\S]*?)`\s*,/);
      template = inline?.[1] ?? '';
    }

    const relative = path.relative(root, filePath).replaceAll('\\', '/');
    if (!template) {
      failures.push(`${relative}: page template could not be inspected`);
      continue;
    }
    if (!template.includes('<app-workspace-page')) {
      failures.push(`${relative}: missing centralized <app-workspace-page> shell`);
    }

    for (const marker of forbiddenTemplateMarkers) {
      if (template.includes(marker)) {
        failures.push(`${relative}: route template reintroduces duplicate page chrome "${marker}"`);
      }
    }

    if (/<nav\b[^>]*class=["'][^"']*(tabs|tab-nav|section-nav)/i.test(template)) {
      failures.push(`${relative}: page-owned tab navigation must use <app-workspace-tabs>`);
    }
  }
}

walk(pagesRoot);

if (failures.length) {
  console.error('Workspace UI architecture check failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('Workspace UI architecture check passed.');
