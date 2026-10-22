// WebCal reference programs; source links are included with each entry.
// 三點求圓 / 三角形四心 來自 webcal.freetzi.com 的 fx-50FH 程式集。
// 頁面為排版而折行的長行已還原成單行（機器的程式是一條指令串）。
export const catalog=[
{
    "id": "linear",
    "name": "聯立二元一次",
    "url": "https://webcal.freetzi.com/casio.fx-50FH/simultaneous1.htm",
    "mode": "COMP",
    "source": "?→A: ?→B: ?→C: ?→D: ?→X: ?→Y: AX-DB→M: M⁻¹(CX-YB→X◢ M⁻¹(AY-DC→Y",
    "description": "ax + by = c；dx + ey = f。依次輸入 a、b、c、d、e、f；EXE 查看 x、y。"
  },
{
    "id": "cubic",
    "name": "一元三次（含複根）",
    "url": "https://webcal.freetzi.com/casio.fx-50FH/cubic1.htm",
    "mode": "CMPLX",
    "source": "?→A: ?→B: ?→C: ?→D: 9A(BC-3AD)⌐2-B³→M: √(M²+(3AC-B²)³ M+: If Ans=Conjg(Ans: Then cbrt(M)+cbrt(M-2Ans: Else 2cbrt(Abs(M))cos(3⁻¹arg(M: IfEnd: (Ans-B)⌐(3A◢ -B⌐A-Ans→M: M⌐2: Ans+√(-3Ans²-BM⌐A-C⌐A M-◢ M",
    "description": "ax³ + bx² + cx + d = 0。依次輸入 a、b、c、d；EXE 查看下一根，SHIFT → EXE 切換實部／虛部。採用已驗證的保留係數版。"
  },
  {
  "id": "linecircle2",
  "name": "圓形與直線的交點(II)",
  "url": "https://webcal.freetzi.com/casio.fx-50FH/circle_intersection2.htm",
  "mode": "COMP",
  "source": "?→X: ?→Y: ?→M: ?→A: -.5A→A: ?→B: -.5B→B: AX+BYM-: ?→C: √(A²+B²-C→C: cos⁻¹(M÷Pol(XC,YC→X: A+Ccos(Y-X◢ B+Csin(Y-X◢ A+Rec(C,X+Y◢ B+Y",
  "description": "求直線與圓的兩個交點。輸入順序：先直線的 x 係數、y 係數、常數（M），再圓的 x、y、常數係數（A B C）；EXE 依次顯示第一個交點的 x、y 與第二個交點的 x、y。直線與圓不相交時 Math ERROR。"
  },
  {
  "id": "circle3a",
  "name": "三點求圓（小數版）",
  "url": "https://webcal.freetzi.com/casio.fx-50FH/3pt_cirlce.htm",
  "mode": "COMP",
  "source": "?→A: ?→B: ?→C: ?→D:(C - A) ┘(B - D→Y: B + D - YA - YC→X:?→C: ?→D: (C - A) ┘(B - D→M:B + D - MA - MC→B:(B - X) ┘(2Y - 2M→A◢ M Ans + B┘2→B◢Pol( A - C, B - D◢ -2A◢ -2B◢ A² + B² - X²",
  "description": "已知圓周上三點的座標，求圓心、半徑與圓方程。依次輸入 (x₁,y₁)、(x₂,y₂)、(x₃,y₃)；EXE 依次顯示圓心 x、圓心 y、半徑，再按 EXE 顯示圓方程的 D、E、F。"
  },
  {
  "id": "circle3b",
  "name": "三點求圓（分數版）",
  "url": "https://webcal.freetzi.com/casio.fx-50FH/3pt_cirlce.htm",
  "mode": "COMP",
  "source": "?→A: ?→B: ?→C: ?→D:(C - A)┘(B - D→Y: B + D - YA - YC→X:?→C: ?→D: (C - A)┘ (B - D→M:B + D - MA - MC→B: (B - X)┘(2Y - 2M→A◢M Ans + B┘2→B◢ √( (A - C)² + (B - D)²→X◢-2A◢ -2B◢ A² + B² - X²",
  "description": "同「三點求圓」，但半徑與圓心會以分數形式顯示，適合輸入為整數或分數的座標。"
  },
  {
  "id": "centres1",
  "name": "三角形四心（分數版）",
  "url": "https://webcal.freetzi.com/casio.fx-50FH/four_centre.htm",
  "mode": "REG",
  "source": "?→X: ?→Y: ?→A: ?→B: ?→C: ?→D: (A+C+X)┘3◢(B+D+Y)┘3◢ FreqOn: X, Y ; Pol(A-C , B-DDT:(x̄-C)┘ (ȳ-D→Y:ȳ - B: C + Ans(YA+B-YC-D)┘(A+Ansȳ-x̄→X◢ B+AY-XY→Y◢ (A+C+x̄-X)┘2◢(B+D+ȳ-Y)┘2◢A , B; Pol(x̄-C, ȳ -D) + 0Pol(x̄-A, ȳ-B DT:C , D ; XDT:x̄◢ȳ",
  "description": "已知三角形三頂點座標，求重心、垂心、外心、內心。需在 REG 模式執行。依次輸入 (x₁,y₁)、(x₂,y₂)、(x₃,y₃)；EXE 依次顯示重心、垂心、外心、內心的座標。"
  },
  {
  "id": "centres2",
  "name": "三角形四心（小數版）",
  "url": "https://webcal.freetzi.com/casio.fx-50FH/four_centre.htm",
  "mode": "REG",
  "source": "?→X: ?→Y: ?→A: ?→B: ?→C: ?→D: 3⁻¹(A+C+X◢3⁻¹(B+D+Y◢ FreqOn: X , Y ; Pol(A-C , B-DDT:(x̄-C) ÷ (ȳ-D→Y:ȳ - B: C + Ans(YA+B-YC-D) ÷(A+Ansȳ-x̄→X◢ B+AY-XY→Y◢.5(A+C+x̄-X◢.5(B+D+ȳ-Y◢A , B; Pol(x̄-C, ȳ -D) + 0Pol(x̄-A, ȳ-B DT:C , D ; XDT:x̄◢ȳ",
  "description": "三角形四心的小數版本，運算較簡潔，結果以小數顯示。需在 REG 模式執行。"
  },
  {
  "id": "centres3",
  "name": "三角形四心（小數簡化版）",
  "url": "https://webcal.freetzi.com/casio.fx-50FH/four_centre.htm",
  "mode": "REG",
  "source": "?→A: ?→B: ?→X: ?→Y: ?→C: ?→D: 3⁻¹(A+C+X◢3⁻¹(B+D+Y◢ FreqOn: X , Y ; Pol(B-D ,A-CDT:tan(Y→Y: B -ȳ: C + Ans(Yx̄+ȳ-YC-D) ÷(x̄+Ansȳ-A→X◢ȳ+x̄Y-XY→Y◢.5(A+C+x̄-X◢.5(B+D+ȳ-Y◢A , B; Pol(x̄-C, ȳ -D) + 0Pol(x̄-A, ȳ-B DT:C , D ; XDT:x̄◢ȳ",
  "description": "三角形四心的簡化小數版本，用正切法求垂心，程式最短。需在 REG 模式執行。"
  },
  {
  "id": "linecircle_s5",
  "name": "直線與圓的交點（S5 正確版）",
  "url": "https://github.com/throwingogo-hub/fx-50fh-ii",
  "mode": "COMP",
  "source": "?→D\n?→X\n?→Y\n?→C\n?→B\n?→A\nX=0⇒Goto 1\nY²+CDY+AD²→A\n-2XY-CDX+BD²→B\nD²+X²→M\n(-B-√(B²-4AM))÷(2M)→C\n(Y-CX)÷D◢\nC◢\n(-B+√(B²-4AM))÷(2M)→C\n(Y-CX)÷D◢\nC◢\nGoto 2\nLbl 1\nY÷D→X◢\nC²-4(X²+BX+A)→M\n(-C+√(M))÷2◢\nX◢\n(-C-√(M))÷2◢\nLbl 2",
  "description": "直線與圓的交點。上游 S5 印刷版，經 424 條測試驗證，鉛直線也處理得了。輸入順序：先直線的 x 係數、y 係數、常數，再圓的 x、y、常數係數；EXE 依次顯示兩個交點的座標。直線與圓不相交時 Math ERROR。"
  },
  {
  "id": "circle3_s5",
  "name": "三點求圓（S5 正確版）",
  "url": "https://github.com/throwingogo-hub/fx-50fh-ii",
  "mode": "COMP",
  "source": "?→A\n?→B\n?→C\n?→D\n?→X\n?→Y\nC-A→C\nD-B→D\nX-A→X\nY-B→Y\n(C(X²+Y²)-X(C²+D²))÷2÷(CY-DX)→M\n((C²+D²)Y-(X²+Y²)D)÷2÷(CY-DX)→C\nA+C→X\nB+M→Y\nX◢Y◢\n√((X-A)²+(Y-B)²)→M◢\n-2X◢-2Y◢\nX²+Y²-M²",
  "description": "已知圓周上三點的座標，求圓心、半徑與圓方程。上游 S5 印刷版，經 424 條測試驗證。依次輸入 (x₁,y₁)、(x₂,y₂)、(x₃,y₃)；EXE 依次顯示圓心 x、圓心 y、半徑，再按 EXE 顯示圓方程的 D、E、F。三點共線會 Math ERROR；與 webcal 版不同，前兩點 y 相同也能算。"
  },
  {
  "id": "centres_s5",
  "name": "三角形四心（S5 正確版）",
  "url": "https://github.com/throwingogo-hub/fx-50fh-ii",
  "mode": "REG",
  "source": "ClrStat\n?→A\n?→B\nA,B DT\n?→C\n?→D\nC,D DT\n?→X\n?→Y\nX,Y DT\nΣx÷3◢\nΣy÷3◢\n√((C-X)²+(D-Y)²)+√((X-A)²+(Y-B)²)+√((A-C)²+(B-D)²)→M\n(√((C-X)²+(D-Y)²)×A+√((X-A)²+(Y-B)²)×C+√((A-C)²+(B-D)²)×X)÷M◢\n(√((C-X)²+(D-Y)²)×B+√((X-A)²+(Y-B)²)×D+√((A-C)²+(B-D)²)×Y)÷M◢\n2×(A×(D-Y)+C×(Y-B)+X×(B-D))→M\nPol(((A²+B²)×(D-Y)+(C²+D²)×(Y-B)+(X²+Y²)×(B-D))÷M,((A²+B²)×(X-C)+(C²+D²)×(A-X)+(X²+Y²)×(C-A))÷M)\nRec(X,Y)\nΣx-2X◢\nΣy-2Y◢\nX◢\nY◢",
  "description": "三角形重心、內心、垂心、外心。上游 S5 印刷版，經 424 條測試驗證，一般三角形都算得對（webcal 版在一般三角形上會算錯垂心）。需在 REG 模式執行。依次輸入三個頂點座標；EXE 依次顯示重心、內心、垂心、外心的座標。"
  }
];
