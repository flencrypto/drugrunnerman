import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import serverless from 'serverless-http';
import { createApp } from '../../src/drugrunnerman/server/api';

let initPromise: Promise<ReturnType<typeof serverless>> | undefined;

function getHandler(): Promise<ReturnType<typeof serverless>> {
	if (!initPromise) {
		initPromise = createApp()
			.then((app) => serverless(app))
			.catch((error) => {
				initPromise = undefined;
				throw error;
			});
	}
	return initPromise;
}

export const handler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
	const fn = await getHandler();
	return fn(event, context) as Promise<APIGatewayProxyResult>;
};
