// 仅声明本项目用到的 uuid 接口，避免额外依赖
declare module "uuid" {
  export function v4(): string;
}
