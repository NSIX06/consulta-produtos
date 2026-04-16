import { useMemo, useState, useRef, useEffect } from 'react';
import { Plus, X, Palette, Check } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { ProductTable } from '@/components/ProductTable';
import { BudgetTable } from '@/components/BudgetTable';
import {
  loadProducts, loadBrands, addBrand, removeBrand,
  updateProductStatus, addProduct,
  loadBrandColors, saveBrandColor,
} from '@/lib/store';
import type { Product, BudgetItem, ParsedRow } from '@/types/product';

const PRESET_COLORS = [
  { label: 'Verde John Deere', value: '#367c2b' },
  { label: 'Verde Claro',      value: '#16a34a' },
  { label: 'Teal',             value: '#0d9488' },
  { label: 'Azul Claro',       value: '#0284c7' },
  { label: 'Azul',             value: '#2563eb' },
  { label: 'Marinho',          value: '#1e40af' },
  { label: 'Índigo',           value: '#4f46e5' },
  { label: 'Roxo',             value: '#7c3aed' },
  { label: 'Rosa',             value: '#db2777' },
  { label: 'Vermelho',         value: '#dc2626' },
  { label: 'Laranja',          value: '#ea580c' },
  { label: 'Âmbar',            value: '#d97706' },
  { label: 'Cinza',            value: '#6b7280' },
  { label: 'Preto',            value: '#1f2937' },
  { label: 'New Holland',      value: '#003DA5' },
  { label: 'Case',             value: '#e4002b' },
];

export default function Index() {
  const [allProducts, setAllProducts] = useState<Product[]>(() => loadProducts());
  const [brands, setBrands] = useState<string[]>(() => loadBrands());
  const [activeBrand, setActiveBrand] = useState<string>(() => loadBrands()[0] ?? 'John Deere');
  const [budgetItems, setBudgetItems] = useState<BudgetItem[] | null>(null);
  const [budgetFileName, setBudgetFileName] = useState<string | undefined>(undefined);

  // Cores personalizadas por marca
  const [brandColors, setBrandColors] = useState<Record<string, string>>(() => loadBrandColors());
  const [colorPickerBrand, setColorPickerBrand] = useState<string | null>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  // Fechar color picker ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setColorPickerBrand(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Adicionar marca
  const [addingBrand, setAddingBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');

  const activeProducts = useMemo(
    () => allProducts.filter((p) => p.brand === activeBrand),
    [allProducts, activeBrand]
  );

  const getTabColor = (brand: string) => brandColors[brand] ?? '#2563eb';

  const handleAddBrand = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newBrandName.trim();
    if (!name) return;
    const updated = addBrand(name);
    setBrands(updated);
    setActiveBrand(name);
    setBudgetItems(null);
    setNewBrandName('');
    setAddingBrand(false);
  };

  const handleRemoveBrand = (brand: string) => {
    const { brands: updatedBrands, products } = removeBrand(brand);
    setBrands(updatedBrands);
    setAllProducts(products);
    if (activeBrand === brand) {
      setActiveBrand(updatedBrands[0]);
      setBudgetItems(null);
    }
  };

  const handleSwitchBrand = (brand: string) => {
    setActiveBrand(brand);
    setBudgetItems(null);
  };

  const handleColorChange = (brand: string, color: string) => {
    const updated = saveBrandColor(brand, color);
    setBrandColors(updated);
    setColorPickerBrand(null);
  };

  const handleBudgetAnalysis = (items: BudgetItem[] | null, fileName?: string) => {
    setBudgetItems(items);
    setBudgetFileName(items ? fileName : undefined);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f0f2f5]">
      <Sidebar
        products={activeProducts}
        activeBrand={activeBrand}
        onProductsChange={setAllProducts}
        onBudgetAnalysis={handleBudgetAnalysis}
      />
      <main className="flex-1 overflow-y-auto scrollbar-thin p-8">
        {/* ── Abas de marcas ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {brands.map((brand) => {
            const isActive = brand === activeBrand;
            const color = getTabColor(brand);

            return (
              <div key={brand} className="relative group">
                {/* Aba */}
                <button
                  onClick={() => handleSwitchBrand(brand)}
                  style={isActive ? { backgroundColor: color, borderColor: color } : {}}
                  className={`flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-medium border transition-colors ${
                    isActive
                      ? 'text-white'
                      : 'bg-white text-muted-foreground border-border hover:border-blue-400 hover:text-blue-600'
                  }`}
                >
                  {brand}
                  <span className={`text-xs font-mono ${isActive ? 'opacity-80' : 'opacity-60'}`}>
                    ({allProducts.filter((p) => p.brand === brand).length})
                  </span>
                </button>

                {/* Botão paleta de cores (hover na aba ativa) */}
                {isActive && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setColorPickerBrand(colorPickerBrand === brand ? null : brand);
                    }}
                    title="Personalizar cor da aba"
                    className="absolute -top-1.5 -right-1.5 hidden group-hover:flex w-5 h-5 rounded-full bg-white border border-border shadow-sm items-center justify-center hover:border-blue-400 transition-colors"
                  >
                    <Palette className="w-3 h-3 text-muted-foreground" />
                  </button>
                )}

                {/* Botão remover (hover em abas não ativas) */}
                {!isActive && brands.length > 1 && (
                  <button
                    onClick={() => handleRemoveBrand(brand)}
                    title={`Remover marca ${brand}`}
                    className="absolute -top-1.5 -right-1.5 hidden group-hover:flex w-4 h-4 rounded-full bg-red-500 text-white items-center justify-center hover:bg-red-600 transition-colors"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}

                {/* Color picker */}
                {colorPickerBrand === brand && (
                  <div
                    ref={colorPickerRef}
                    className="absolute top-11 left-0 z-50 bg-white border border-border rounded-xl shadow-xl p-4 w-64"
                  >
                    <p className="text-xs font-semibold text-foreground mb-3">
                      Cor da aba — <span className="text-muted-foreground">{brand}</span>
                    </p>
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      {PRESET_COLORS.map((c) => {
                        const isSelected = color === c.value;
                        return (
                          <button
                            key={c.value}
                            title={c.label}
                            onClick={() => handleColorChange(brand, c.value)}
                            style={{ backgroundColor: c.value }}
                            className={`w-full h-9 rounded-lg transition-all flex items-center justify-center ${
                              isSelected
                                ? 'ring-2 ring-offset-2 ring-gray-400 scale-105'
                                : 'hover:scale-105 hover:ring-2 hover:ring-offset-1 hover:ring-gray-300'
                            }`}
                          >
                            {isSelected && <Check className="w-4 h-4 text-white drop-shadow" />}
                          </button>
                        );
                      })}
                    </div>
                    {/* Divider */}
                    <div className="border-t border-border pt-3">
                      <p className="text-[10px] text-muted-foreground mb-1.5">Hex personalizado</p>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-8 h-8 rounded-lg border border-border flex-shrink-0 shadow-sm"
                          style={{ backgroundColor: color }}
                        />
                        <input
                          type="text"
                          value={color}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (/^#[0-9a-fA-F]{0,6}$/.test(val)) {
                              if (/^#[0-9a-fA-F]{6}$/.test(val)) handleColorChange(brand, val);
                              else setBrandColors((prev) => ({ ...prev, [brand]: val }));
                            }
                          }}
                          className="flex-1 min-w-0 h-8 px-2 text-sm font-mono border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="#000000"
                          maxLength={7}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Adicionar nova marca */}
          {addingBrand ? (
            <form onSubmit={handleAddBrand} className="flex items-center gap-1.5">
              <input
                autoFocus
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                placeholder="Nome da marca..."
                className="h-9 px-3 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-44"
              />
              <button
                type="submit"
                className="h-9 px-3 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                OK
              </button>
              <button
                type="button"
                onClick={() => { setAddingBrand(false); setNewBrandName(''); }}
                className="h-9 w-9 text-sm border border-border rounded-lg text-muted-foreground hover:border-red-400 hover:text-red-500 transition-colors flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <button
              onClick={() => setAddingBrand(true)}
              title="Adicionar nova marca"
              className="h-9 px-3 rounded-lg border border-dashed border-border text-muted-foreground hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center gap-1.5 text-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Marca
            </button>
          )}
        </div>

        {/* ── Conteúdo da aba ────────────────────────────────────────────── */}
        {budgetItems ? (
          <BudgetTable
            items={budgetItems}
            fileName={budgetFileName}
            onClose={() => { setBudgetItems(null); setBudgetFileName(undefined); }}
            onAddToDatabase={(item, codigo) => {
              const row: ParsedRow = {
                descricao: item.descricao,
                codigo,
                cod_fabricacao: item.cod_fabricacao,
              };
              const newAll = addProduct(row, activeBrand);
              setAllProducts(newAll);
              const added = newAll[newAll.length - 1];
              setBudgetItems((prev) =>
                prev?.map((bi) =>
                  bi === item
                    ? { ...bi, encontrado: true, matchedBy: 'exato', matchScore: 100, matchedProduct: added }
                    : bi
                ) ?? null
              );
            }}
          />
        ) : (
          <ProductTable
            products={activeProducts}
            brandName={activeBrand}
            onStatusChange={(id, status, codigo) =>
              setAllProducts(updateProductStatus(id, status, codigo))
            }
          />
        )}
      </main>
    </div>
  );
}
