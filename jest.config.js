module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	testMatch: ['**/drugrunnerman/**/*.test.ts'],
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/src/$1',
	},
};
