import { expect, type Page, test } from "@playwright/test";

/** Relative luminance (sRGB) for WCAG contrast math. */
function luminance(rgb: { r: number; g: number; b: number }): number {
	const lin = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	const r = lin(rgb.r);
	const g = lin(rgb.g);
	const b = lin(rgb.b);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(
	a: { r: number; g: number; b: number },
	b: { r: number; g: number; b: number },
): number {
	const l1 = luminance(a);
	const l2 = luminance(b);
	const lighter = Math.max(l1, l2);
	const darker = Math.min(l1, l2);
	return (lighter + 0.05) / (darker + 0.05);
}

function parseRgb(color: string): { r: number; g: number; b: number } | null {
	const m = color.match(
		/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i,
	);
	if (!m) {
		// modern browsers may return "rgb(16 21 28)" space-separated
		const m2 = color.match(/rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
		if (!m2) return null;
		return {
			r: Number(m2[1]),
			g: Number(m2[2]),
			b: Number(m2[3]),
		};
	}
	return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
}

async function readColors(
	page: Page,
	selector: string,
): Promise<{ color: string; backgroundColor: string }> {
	return page.locator(selector).evaluate((el) => {
		const styles = getComputedStyle(el);
		return {
			color: styles.color,
			backgroundColor: styles.backgroundColor,
		};
	});
}

async function assertReadableText(
	page: Page,
	selector: string,
	minRatio: number,
	label: string,
) {
	const el = page.locator(selector).first();
	await expect(el).toBeVisible();

	// Walk up until we find a non-transparent background for contrast.
	const pair = await el.evaluate((node) => {
		const textColor = getComputedStyle(node).color;
		let bg = "rgba(0, 0, 0, 0)";
		let cur: Element | null = node;
		while (cur) {
			const c = getComputedStyle(cur).backgroundColor;
			if (c && !c.includes("0, 0, 0, 0") && c !== "transparent") {
				// also skip fully transparent alpha
				const alpha = c.match(/[\d.]+\)$/);
				if (c.startsWith("rgba") && alpha) {
					const a = Number(c.slice(c.lastIndexOf(",") + 1, -1));
					if (a < 0.05) {
						cur = cur.parentElement;
						continue;
					}
				}
				bg = c;
				break;
			}
			cur = cur.parentElement;
		}
		return { color: textColor, backgroundColor: bg };
	});

	const fg = parseRgb(pair.color);
	const bg = parseRgb(pair.backgroundColor);
	expect(fg, `${label}: parse foreground ${pair.color}`).not.toBeNull();
	expect(bg, `${label}: parse background ${pair.backgroundColor}`).not.toBeNull();
	const ratio = contrastRatio(fg!, bg!);
	expect(
		ratio,
		`${label}: contrast ${ratio.toFixed(2)}:1 (fg=${pair.color}, bg=${pair.backgroundColor})`,
	).toBeGreaterThanOrEqual(minRatio);
}

async function assertNoHorizontalOverflow(page: Page) {
	const overflow = await page.evaluate(() => {
		const doc = document.documentElement;
		return {
			scrollWidth: doc.scrollWidth,
			clientWidth: doc.clientWidth,
		};
	});
	expect(
		overflow.scrollWidth,
		`horizontal overflow: scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}`,
	).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

async function clearTheme(page: Page) {
	await page.goto("/");
	await page.evaluate(() => {
		try {
			localStorage.removeItem("theme");
		} catch {
			// ignore
		}
	});
	// Re-apply system defaults without wiping on subsequent navigations.
	await page.evaluate(() => {
		document.documentElement.classList.remove("dark");
		document.documentElement.dataset.theme = "system";
		const dark = matchMedia("(prefers-color-scheme: dark)").matches;
		document.documentElement.classList.toggle("dark", dark);
	});
}

test.describe("theme, contrast, and responsive layout", () => {
	test("home renders primary content and readable body text", async ({
		page,
	}) => {
		await clearTheme(page);
		await page.goto("/");
		await expect(page.getByTestId("home-page")).toBeVisible();
		await expect(page.getByTestId("home-title")).toBeVisible();
		await expect(page.getByTestId("home-blurb")).toBeVisible();
		await expect(page.getByTestId("theme-toggle")).toBeVisible();

		// Body ink on paper — WCAG AA for normal text (4.5:1)
		await assertReadableText(page, "[data-testid=home-title]", 4.5, "title");
		await assertReadableText(page, "[data-testid=home-blurb]", 4.5, "blurb");
		await assertNoHorizontalOverflow(page);
	});

	test("theme toggle switches light and dark with readable text", async ({
		page,
	}) => {
		await clearTheme(page);
		await page.goto("/");
		const html = page.locator("html");

		await page.getByTestId("theme-dark").click();
		await expect(html).toHaveClass(/dark/);
		await expect(html).toHaveAttribute("data-theme", "dark");
		await assertReadableText(
			page,
			"[data-testid=home-title]",
			4.5,
			"title dark",
		);
		await assertReadableText(
			page,
			"[data-testid=home-blurb]",
			4.5,
			"blurb dark",
		);

		// Primary CTA: primary-fg on primary bg
		const cta = page.getByTestId("nav-sign-in");
		await expect(cta).toBeVisible();
		const ctaColors = await readColors(page, "[data-testid=nav-sign-in]");
		const ctaFg = parseRgb(ctaColors.color);
		const ctaBg = parseRgb(ctaColors.backgroundColor);
		expect(ctaFg).not.toBeNull();
		expect(ctaBg).not.toBeNull();
		expect(
			contrastRatio(ctaFg!, ctaBg!),
			`CTA dark contrast ${ctaColors.color} on ${ctaColors.backgroundColor}`,
		).toBeGreaterThanOrEqual(4.5);

		await page.getByTestId("theme-light").click();
		await expect(html).not.toHaveClass(/dark/);
		await expect(html).toHaveAttribute("data-theme", "light");
		await assertReadableText(
			page,
			"[data-testid=home-title]",
			4.5,
			"title light",
		);
		await assertReadableText(
			page,
			"[data-testid=home-blurb]",
			4.5,
			"blurb light",
		);

		const lightCta = await readColors(page, "[data-testid=nav-sign-in]");
		const lFg = parseRgb(lightCta.color);
		const lBg = parseRgb(lightCta.backgroundColor);
		expect(lFg).not.toBeNull();
		expect(lBg).not.toBeNull();
		expect(
			contrastRatio(lFg!, lBg!),
			`CTA light contrast ${lightCta.color} on ${lightCta.backgroundColor}`,
		).toBeGreaterThanOrEqual(4.5);

		// Preference persists across reload (do not clear localStorage here)
		const stored = await page.evaluate(() => localStorage.getItem("theme"));
		expect(stored).toBe("light");
		await page.reload();
		await expect(html).not.toHaveClass(/dark/);
		await expect(html).toHaveAttribute("data-theme", "light");
	});

	test("sign-in form colors are correct in light and dark", async ({
		page,
	}) => {
		await clearTheme(page);
		await page.goto("/sign-in");
		await expect(page.getByTestId("auth-card")).toBeVisible();
		await expect(page.getByTestId("theme-toggle")).toBeVisible();

		const email = page.locator('input[type="email"]');
		await expect(email).toBeVisible();

		// Light
		await page.getByTestId("theme-light").click();
		await assertReadableText(page, "h1", 4.5, "sign-in title light");
		const lightInput = await readColors(page, 'input[type="email"]');
		const liFg = parseRgb(lightInput.color);
		const liBg = parseRgb(lightInput.backgroundColor);
		expect(liFg).not.toBeNull();
		expect(liBg).not.toBeNull();
		expect(
			contrastRatio(liFg!, liBg!),
			`input light ${lightInput.color} on ${lightInput.backgroundColor}`,
		).toBeGreaterThanOrEqual(4.5);

		// Dark
		await page.getByTestId("theme-dark").click();
		await expect(page.locator("html")).toHaveClass(/dark/);
		await assertReadableText(page, "h1", 4.5, "sign-in title dark");
		const darkInput = await readColors(page, 'input[type="email"]');
		const diFg = parseRgb(darkInput.color);
		const diBg = parseRgb(darkInput.backgroundColor);
		expect(diFg).not.toBeNull();
		expect(diBg).not.toBeNull();
		expect(
			contrastRatio(diFg!, diBg!),
			`input dark ${darkInput.color} on ${darkInput.backgroundColor}`,
		).toBeGreaterThanOrEqual(4.5);

		await assertNoHorizontalOverflow(page);
	});

	test("layout does not overflow and hero stays within viewport width", async ({
		page,
	}) => {
		await clearTheme(page);
		await page.goto("/");
		const viewport = page.viewportSize();
		expect(viewport).not.toBeNull();

		const hero = page.getByTestId("home-hero");
		const box = await hero.boundingBox();
		expect(box).not.toBeNull();
		expect(box!.width).toBeLessThanOrEqual(viewport!.width);
		expect(box!.x).toBeGreaterThanOrEqual(0);

		// On 4K, content should not stretch edge-to-edge (max-width constraint)
		if (viewport!.width >= 3000) {
			expect(box!.width).toBeLessThan(viewport!.width * 0.85);
		}

		// On mobile, hero uses most of the content width
		if (viewport!.width <= 430) {
			expect(box!.width).toBeGreaterThan(viewport!.width * 0.7);
		}

		await assertNoHorizontalOverflow(page);
		await expect(page.getByTestId("home-nav")).toBeVisible();
	});
});
