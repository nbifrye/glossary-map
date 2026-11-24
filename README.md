# Glossary Map

文書の用語集を対象に、各用語の定義と、定義中に登場する用語への参照をグラフで示す静的サイトです。要件は [要件定義書](docs/requirements.md)、設計は [設計書](docs/design.md) にまとめています。

## 開発

Node.js 26 以降を使います。

```sh
npm ci
npm run dev
```

プルリクエストを送る前に、次のチェックを実行してください。ブラウザーテストを初めて実行するときは、先に `npx playwright install` でブラウザーをインストールします。

```sh
npm run check
npm test
npm run build
npm run test:browser
```
