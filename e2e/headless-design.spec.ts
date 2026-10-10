import { expect, test } from "@playwright/test";

test("a product skin and Tailwind utilities override default presentation", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByTestId("theme-light").click();
	await page.addStyleTag({
		content: `:root {
			--primary: #7c3aed;
			--primary-foreground: #ffffff;
			--radius: 1.25rem;
		}`,
	});

	const action = page.getByTestId("nav-sign-in");
	await expect(action).toHaveCSS("background-color", "rgb(124, 58, 237)");
	await expect(action).toHaveCSS("border-radius", "20px");

	// Utilities in the consuming page take precedence over component CSS.
	await action.evaluate((node) => node.classList.add("px-2", "text-xs"));
	await expect(action).toHaveCSS("font-size", "12px");
	await expect(action).toHaveCSS("padding-left", "8px");

	await page.goto("/sign-in");
	await page.addStyleTag({
		content: ":root { --background: #fff7ed; --radius: 1.25rem; }",
	});
	await expect(page.getByTestId("auth-card")).toBeVisible();
	await expect(page.locator('input[type="email"]')).toHaveCSS(
		"background-color",
		"rgb(255, 247, 237)",
	);
	await expect(page.locator('input[type="email"]')).toHaveCSS(
		"border-radius",
		"20px",
	);
});

test("popup motion respects user preference and preserves locale and keyboard behavior", async ({
	page,
}) => {
	await page.emulateMedia({ reducedMotion: "no-preference" });
	await page.goto("/sign-in?redirect=%2Fdashboard&ba_param=a&ba_param=b#flow");
	const trigger = page.getByTestId("locale-switcher");
	const menu = page.getByTestId("locale-switcher-menu");
	await trigger.click();
	await expect(menu).toBeVisible();
	await expect(menu).toHaveCSS("transition-duration", "0.15s, 0.15s");
	await page.keyboard.press("Escape");
	await expect(menu).toBeHidden();
	await expect(trigger).toBeFocused();

	await page.emulateMedia({ reducedMotion: "reduce" });
	await trigger.click();
	await expect(menu).toBeVisible();
	await expect(menu).toHaveCSS("transition-duration", "0s");
	const href = await page.getByTestId("locale-link-de").getAttribute("href");
	const localized = new URL(href!, page.url());
	expect(localized.pathname).toBe("/de/sign-in");
	expect(localized.searchParams.getAll("ba_param")).toEqual(["a", "b"]);
	expect(localized.searchParams.get("redirect")).toBe("/dashboard");
	expect(localized.hash).toBe("#flow");
	await page.getByTestId("locale-link-de").click();
	await expect(page).toHaveURL(localized.href);
	await expect(page.locator("html")).toHaveAttribute("lang", "de");
});
