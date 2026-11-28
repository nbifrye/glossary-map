// networkanalysis-ts の Leiden 法に、種を指定した乱数生成器を渡すための型定義
declare module "java-random" {
	export default class Random {
		constructor(seed?: number);
		nextDouble(): number;
		nextInt(bound?: number): number;
	}
}
