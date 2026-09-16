describe('centralized deep-maroon theme', () => {
    it('keeps document compatibility tokens bound to the centralized brand tokens', () => {
        const styles = getComputedStyle(document.documentElement);

        expect(styles.getPropertyValue('--dts-accent').trim()).toBe('var(--brand-primary)');
        expect(styles.getPropertyValue('--dts-accent-deep').trim()).toBe('var(--brand-primary-deep)');
        expect(styles.getPropertyValue('--dts-accent-soft').trim()).toBe('var(--brand-soft-strong)');
    });

    it('uses the white primary contrast for filled danger actions', () => {
        const styles = getComputedStyle(document.documentElement);

        expect(styles.getPropertyValue('--brand-contrast').trim()).toBe('var(--p-primary-contrast-color)');
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
