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
});
