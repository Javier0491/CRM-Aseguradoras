import { Construction } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export function ModulePlaceholder({ title }: { title: string }) {
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Construction className="size-8 text-primary" />
          <p className="text-sm text-muted-foreground">
            Módulo en construcción.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
