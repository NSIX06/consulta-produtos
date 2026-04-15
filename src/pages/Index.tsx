import { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { ProductTable } from '@/components/ProductTable';
import { BudgetTable } from '@/components/BudgetTable';
import { loadProducts } from '@/lib/store';
import type { Product, BudgetItem } from '@/types/product';

export default function Index() {
  const [products, setProducts] = useState<Product[]>(() => loadProducts());
  const [budgetItems, setBudgetItems] = useState<BudgetItem[] | null>(null);

  return (
    <div className="flex h-screen overflow-hidden bg-[#f0f2f5]">
      <Sidebar
        products={products}
        onProductsChange={setProducts}
        onBudgetAnalysis={setBudgetItems}
      />
      <main className="flex-1 overflow-y-auto scrollbar-thin p-8">
        {budgetItems ? (
          <BudgetTable items={budgetItems} onClose={() => setBudgetItems(null)} />
        ) : (
          <ProductTable products={products} />
        )}
      </main>
    </div>
  );
}
