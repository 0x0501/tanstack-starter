import { expect, test } from "@playwright/test";

test("authenticated pages hydrate consistently and retain Headless interactions", async ({
	page,
}) => {
	const email = process.env.E2E_USER_EMAIL;
	const password = process.env.E2E_USER_PASSWORD;
	if (!email || !password) {
		test.skip(true, "Set E2E_USER_EMAIL/PASSWORD for a seeded local user.");
		return;
	}

	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/sign-in");
	await page.getByLabel("Email", { exact: true }).fill(email);
	await page.getByLabel("Password", { exact: true }).fill(password);
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await page.getByTestId("theme-dark").click();
	expect(errors).toEqual([]);

	await page.goto("/dashboard/account");
	await page.getByRole("tab", { name: "Profile", exact: true }).focus();
	await page.keyboard.press("ArrowRight");
	const security = page.getByRole("tab", { name: "Security", exact: true });
	await expect(security).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(security).toHaveAttribute("aria-selected", "true");
	await page.getByRole("tab", { name: "Profile", exact: true }).click();
	const select = page.getByRole("combobox");
	await select.click();
	await page.getByRole("option", { name: "Deutsch", exact: true }).click();
	await expect(select).toContainText("Deutsch");
	await expect(select).toBeFocused();
	await expect(page.locator('nav a[aria-current="page"]')).toContainText(
		"Account",
	);
	expect(errors).toEqual([]);
});
