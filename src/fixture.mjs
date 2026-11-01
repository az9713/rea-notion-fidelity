// Entirely invented research notes. IDs are synthetic, not a real workspace export.
const annotation=(extra={})=>({bold:false,italic:false,strikethrough:false,underline:false,code:false,color:'default',...extra});
const text=(content,extra={})=>({type:'text',text:{content,link:null},annotations:annotation(),plain_text:content,href:null,...extra});
const block=(type,payload,id)=>({object:'block',id:`00000000-0000-4000-8000-${String(id).padStart(12,'0')}`,created_time:'2026-10-31T12:00:00.000Z',has_children:false,type,[type]:payload});
export const fixture={object:'list',type:'block',block:{},has_more:false,next_cursor:null,synthetic_fixture:true,results:[
  block('heading_1',{rich_text:[text('Research survives format changes.')],color:'default',is_toggleable:false},1),
  block('paragraph',{rich_text:[text('The interesting part is not the text. ',{annotations:annotation({bold:true})}),text('It is what the text carries.',{annotations:annotation({italic:true,color:'blue'})})],color:'default',future_payload:{method:'synthetic',revision:7}},2),
  block('quote',{rich_text:[text('A conversion is a model of a document, not the document itself.',{annotations:annotation({underline:true})})],color:'yellow_background'},3),
  {...block('bulleted_list_item',{rich_text:[text('Preserve the original structured evidence.')],color:'default',children:[block('paragraph',{rich_text:[text('Nested observations retain their identities in native JSON.')],color:'default'},5)]},4),has_children:true},
  block('numbered_list_item',{rich_text:[text('Inspect exactly which fields a portable export omits.')],color:'default'},6),
  block('paragraph',{rich_text:[text('Inline relation: '),{type:'equation',equation:{expression:'\\nabla\\cdot\\mathbf{E}=\\rho/\\varepsilon_0'},annotations:annotation(),plain_text:'\\nabla\\cdot\\mathbf{E}=\\rho/\\varepsilon_0',href:null},text(' ; synthetic reference: '),{type:'mention',mention:{type:'page',page:{id:'00000000-0000-4000-8000-000000000099'}},annotations:annotation(),plain_text:'Imaginary field notes',href:null}],color:'default'},7),
  block('equation',{expression:'i\\hbar\\frac{\\partial}{\\partial t}\\Psi=\\hat{H}\\Psi'},8),
  block('callout',{rich_text:[text('This unsupported callout remains an opaque JSON object.')],icon:{type:'emoji',emoji:'!'},color:'gray_background',future_setting:{preserve_me:true}},9),
  block('paragraph',{rich_text:[text('Official block schema',{text:{content:'Official block schema',link:{url:'https://developers.notion.com/reference/block'}},href:'https://developers.notion.com/reference/block'})],color:'default'},10)
]};
