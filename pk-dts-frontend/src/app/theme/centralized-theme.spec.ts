import { BrandPreset } from './brand-preset';

describe('centralized deep-maroon theme', () => {
    it('keeps the centralized brand preset bound to the document compatibility palette', () => {
        const preset = BrandPreset as any;

        expect(preset.semantic.primary[500]).toBe('#800000');
        expect(preset.semantic.colorScheme.light.primary.color).toBe('{primary.500}');
        expect(preset.semantic.colorScheme.light.primary.contrastColor).toBe('#ffffff');
        expect(preset.semantic.colorScheme.light.primary.hoverColor).toBe('{primary.600}');
        expect(preset.semantic.colorScheme.light.primary.activeColor).toBe('{primary.700}');
    });

    it('keeps filled default primary button content light', () => {
        const button = document.createElement('button');
        button.className = 'p-button p-component';
        button.style.setProperty('--brand-contrast', '#ffffff');

        const icon = document.createElement('span');
        icon.className = 'p-button-icon pi pi-plus';
        const label = document.createElement('span');
        label.className = 'p-button-label';
        label.textContent = 'New Document';
        button.append(icon, label);
        document.body.appendChild(button);

        expect(getComputedStyle(button).color).toBe('rgb(255, 255, 255)');
        expect(getComputedStyle(label).color).toBe('rgb(255, 255, 255)');
        expect(getComputedStyle(icon).color).toBe('rgb(255, 255, 255)');

        button.remove();
    });
});
