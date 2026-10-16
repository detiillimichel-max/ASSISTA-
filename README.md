# ASSISTA  — Catálogo Internet Archive

Repositório independente para coletar metadados públicos do Internet Archive e publicar um catálogo JSON para aplicativos consumidores, como o PLAYORA.

## Arquivos
- `catalog.json`: catálogo consolidado.
- `catalog/*.json`: um arquivo por categoria, gerado pelo coletor.
- `scripts/coletar.py`: busca, deduplicação e validação de arquivos de vídeo.
- `.github/workflows/coletar.yml`: execução manual e diária.

## Executar agora
1. Abra a aba **Actions**.
2. Selecione **Atualizar catálogo Internet Archive**.
3. Toque em **Run workflow** e confirme.
4. Abra a execução mais recente e acompanhe os passos.

O workflow pesquisa uma meta configurada de 1.000 candidatos únicos distribuídos entre oito categorias. Para limitar o volume de chamadas, verifica até 160 candidatos novos por execução e preserva os itens validados anteriormente. A contagem final depende dos arquivos de vídeo realmente encontrados.

## Fonte e direitos
A fonte é o Internet Archive. A existência de um arquivo não significa que seja de domínio público nem que possa ser redistribuído. Confira os direitos e a licença de cada item antes de usá-lo.

Não são necessárias chaves privadas para a busca pública. O workflow grava apenas os arquivos de catálogo deste repositório.
