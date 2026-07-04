// esbuild 构建脚本
// 输出 CommonJS 格式（思源插件加载器要求）
const esbuild = require("esbuild");

async function build() {
  const ctx = await esbuild.context({
    entryPoints: ["src/index.js"],
    bundle: true,
    format: "cjs",          // 关键：CommonJS 格式，module.exports
    outfile: "index.js",    // 直接输出到根目录
    external: ["siyuan"],   // siyuan 由运行时提供
    platform: "browser",
    target: ["es2020"],
    sourcemap: false,
    minify: false,
    logLevel: "info",
    // 思源插件加载器期望 module.exports 直接是类，不是 { default: class }
    // esbuild cjs 格式会输出 __esModule wrapper，需要 footer 修正
    footer: { js: "module.exports = module.exports.default || module.exports;" },
  });

  const isWatch = process.argv.includes("--watch");
  if (isWatch) {
    await ctx.watch();
    console.log("Watching for changes...");
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log("Build complete: index.js");
  }
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
