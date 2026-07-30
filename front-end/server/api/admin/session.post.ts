import { defineEventHandler } from "h3";
import {
	createAdminSession,
	parseAdminMfaCode,
	parseAdminPassword,
	parseAdminUsername,
	readAdminRequestBody,
} from "../../utils/admin-auth";

interface AdminLoginBody {
	mfaCode?: string;
	password?: string;
	username?: string;
}

export default defineEventHandler(async (event) => {
	const body = await readAdminRequestBody(event) as AdminLoginBody;
	const username = parseAdminUsername(body.username);
	const password = parseAdminPassword(body.password, "Admin password");
	const mfaCode = parseAdminMfaCode(body.mfaCode);

	return await createAdminSession(event, username, password, mfaCode);
});
