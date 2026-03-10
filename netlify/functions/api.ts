import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import serverless from 'serverless-http';
import { createApp } from '../../src/drugrunnerman/server/api';

let initPromise: Promise<ReturnType<typeof serverless>> | undefined;

function getHandler(): Promise<ReturnType<typeof serverless>> {
	if (!initPromise) {
		initPromise = createApp().then((app) => serverless(app));
	}
	return initPromise;
}

export const main = async (
	event: APIGatewayProxyEvent,
	context: Context,
): Promise<APIGatewayProxyResult> => {
	const handler = await getHandler();
	return handler(event, context) as Promise<APIGatewayProxyResult>;
};
