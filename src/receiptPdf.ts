import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import type { VersionReceipt } from './versionReceipt';

export async function downloadReceiptPdf(receipt: VersionReceipt, filename: string) {
  const [{default:pdfMake}, {default:fonts}] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]);
  const definition: TDocumentDefinitions = {
    pageSize:'LETTER',
    pageMargins:[40,40,40,48],
    defaultStyle:{fontSize:9},
    info:{title:receipt.assessmentTitle+' — Version '+receipt.version+' receipt'},
    footer:(page, pages) => ({
      text:'Teacher copy · Run '+receipt.runId+' · Page '+page+' of '+pages,
      alignment:'center',
      fontSize:8,
    }),
    content:[
      {text:'Version '+receipt.version+' receipt', fontSize:20, bold:true},
      {text:receipt.assessmentTitle, fontSize:12, margin:[0,4,0,6]},
      {text:'Teacher copy — contains correct answers · Run '+receipt.runId, margin:[0,0,0,16]},
      {text:'Question numbers in the reviewed assessment are counted within each section. Choice letters read from the reviewed choice to its generated position.', margin:[0,0,0,10]},
      {
        layout:'lightHorizontalLines',
        table:{
          headerRows:1,
          widths:['*',42,46,42,'*',38],
          body:[
            ['Reviewed assessment','Word Q','Version Q','Alt.','Choice mapping','Key'],
            ...receipt.questions.map(row => [
              'Section '+row.sectionNumber+' · '+row.sectionTitle+' · Q'+row.sourceQuestion,
              row.wordQuestion===undefined ? '—' : String(row.wordQuestion),
              String(row.generatedNumber),
              String(row.alternative),
              row.choices.map(choice => choice.source+' → '+choice.generated).join(', ') || '—',
              row.choices.filter(choice => choice.correct).map(choice => choice.generated).sort().join(', ') || '—',
            ]),
          ],
        },
      },
    ],
  };
  pdfMake.createPdf(definition,undefined,undefined,fonts).download(filename);
}
