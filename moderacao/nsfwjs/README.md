# Moderação visual NSFWJS — ASSISTA+

Este módulo analisa as **imagens de capa** do catálogo com NSFWJS. O filtro textual multilíngue continua no coletor Python; as duas verificações são complementares.

## Dependências

- Node.js 20+
- `@tensorflow/tfjs-node`
- `nsfwjs`

## Decisão de segurança

- Rejeita capas acima dos limiares configurados para `Porn`, `Hentai` e `Sexy`.
- Se a imagem não puder ser carregada ou analisada, o item é rejeitado nesta execução (fail closed).
- Só aceita URLs HTTPS de `archive.org`.
- Limita cada imagem a 8 MB e o tempo de download a 15 segundos.
- Não envia imagens a uma API paga; a classificação é executada no runner do GitHub Actions.

## Limitações importantes

O modelo classifica uma imagem, não o vídeo inteiro. Uma capa aprovada não garante que todas as cenas, legendas, áudio ou conteúdo do arquivo sejam adequados para crianças. O NSFWJS também pode gerar falsos positivos/negativos; os limiares são conservadores e devem ser testados antes de considerar o catálogo totalmente seguro.

## Teste de uma URL

```bash
npm install
node -e 'const m=require("./classificar"); m.analisarUrl("https://archive.org/services/img/IDENTIFIER").then(console.log)'
```
