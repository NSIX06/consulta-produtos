import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { ProductTable } from '@/components/ProductTable';
import { BudgetTable } from '@/components/BudgetTable';
import { loadProducts, loadBrands, addBrand, removeBrand, updateProductStatus, addProduct } from '@/lib/store';
import type { Product, BudgetItem, ParsedRow } from '@/types/product';

// Cores por marca (expanda conforme necessário)
const BRAND_COLORS: Record<string, string> = {
  'John Deere': 'bg-[#367c2b] border-[#367c2b] hover:bg-[#2e6b25]',
};

function getBrandActiveClass(brand: string): string {
  return BRAND_COLORS[brand] ?? 'bg-blue-600 border-blue-600 hover:bg-blue-700';
}

export default function Index() {
  const [allProducts, setAllProducts] = useState<Product[]>(() => loadProducts());
  const [brands, setBrands] = useState<string[]>(() => loadBrands());
  const [activeBrand, setActiveBrand] = useState<string>(() => loadBrands()[0] ?? 'John Deere');
  const [budgetItems, setBudgetItems] = useState<BudgetItem[] | null>(null);

  // Adicionar marca
  const [addingBrand, setAddingBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');

  const activeProducts = useMemo(
    () => allProducts.filter((p) => p.brand === activeBrand),
    [allProducts, activeBrand]
  );

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

  return (
    <div className="flex h-screen overflow-hidden bg-[#f0f2f5]">
      <Sidebar
        products={activeProducts}
        activeBrand={activeBrand}
        onProductsChange={setAllProducts}
        onBudgetAnalysis={setBudgetItems}
      />
      <main className="flex-1 overflow-y-auto scrollbar-thin p-8">
        {/* ── Abas de marcas ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {brands.map((brand) => {
            const isActive = brand === activeBrand;
            return (
              <div key={brand} className="relative group">
                <button
                  onClick={() => handleSwitchBrand(brand)}
                  className={`flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-medium border transition-colors ${
                    isActive
                      ? `${getBrandActiveClass(brand)} text-white`
                      : 'bg-white text-muted-foreground border-border hover:border-blue-400 hover:text-blue-600'
                  }`}
                >
                  {brand}
                  <span className={`text-xs font-mono ${isActive ? 'opacity-80' : 'opacity-60'}`}>
                    ({allProducts.filter((p) => p.brand === brand).length})
                  </span>
                </button>
                {/* Botão remover (aparece ao hover, só em marcas não ativas) */}
                {!isActive && brands.length > 1 && (
                  <button
                    onClick={() => handleRemoveBrand(brand)}
                    title={`Remover marca ${brand}`}
                    className="absolute -top-1.5 -right-1.5 hidden group-hover:flex w-4 h-4 rounded-full bg-red-500 text-white items-center justify-center hover:bg-red-600 transition-colors"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
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
            onClose={() => setBudgetItems(null)}
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
