// 思源运行时全局（构建期由宿主提供，无官方 .d.ts，这里宽松声明）
// $ 为 SiYuan 注入的 jQuery 实例；仅做可用性声明，不做 DOM 细粒度类型约束。
declare const $: any;
declare const jQuery: any;
