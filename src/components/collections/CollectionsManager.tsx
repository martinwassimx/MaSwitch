import React, { useState } from 'react';
import {
  Folder,
  Flame,
  Sparkles,
  Gamepad2,
  Trophy,
  Heart,
  Clock,
  Plus,
  Trash2,
  Edit2,
  Search,
  Check,
  X,
  Layers,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type {
  CollectionItem,
  CollectionSortOrder,
  SmartCollectionRules,
} from '../../shared/types/collection';
import type { PlatformId } from '../../shared/types/platform';
import type { GameItem } from '../../shared/types/game';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Folder,
  Flame,
  Sparkles,
  Gamepad2,
  Trophy,
  Heart,
  Clock,
};

const COLOR_PRESETS = [
  '#8B5CF6', // Violet
  '#38BDF8', // Cyan
  '#34D399', // Emerald
  '#F59E0B', // Amber
  '#F43F5E', // Rose
  '#6366F1', // Indigo
];

export const CollectionsManager: React.FC = () => {
  const collections = useAppStore((s) => s.collections);
  const activeCollectionId = useAppStore((s) => s.activeCollectionId);
  const setActiveCollectionId = useAppStore((s) => s.setActiveCollectionId);
  const createCollection = useAppStore((s) => s.createCollection);
  const updateCollection = useAppStore((s) => s.updateCollection);
  const deleteCollection = useAppStore((s) => s.deleteCollection);
  const addGameToCollection = useAppStore((s) => s.addGameToCollection);
  const removeGameFromCollection = useAppStore((s) => s.removeGameFromCollection);
  const games = useAppStore((s) => s.games);
  const openGameDetails = useAppStore((s) => s.openGameDetails);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCollection, setEditingCollection] = useState<CollectionItem | null>(null);
  const [showAddGamesModal, setShowAddGamesModal] = useState(false);
  const [collectionSearch, setCollectionSearch] = useState('');
  const [gameSearchInCollection, setGameSearchInCollection] = useState('');

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIcon, setFormIcon] = useState('Folder');
  const [formColor, setFormColor] = useState('#8B5CF6');
  const [formIsSmart, setFormIsSmart] = useState(false);
  const [formRules, setFormRules] = useState<SmartCollectionRules>({});
  const [formSortOrder, setFormSortOrder] = useState<CollectionSortOrder>('title-asc');

  const selectedCollection = collections.find((c) => c.id === activeCollectionId) ?? collections[0];

  const handleOpenCreate = () => {
    setEditingCollection(null);
    setFormName('');
    setFormDescription('');
    setFormIcon('Folder');
    setFormColor('#8B5CF6');
    setFormIsSmart(false);
    setFormRules({});
    setFormSortOrder('title-asc');
    setShowCreateModal(true);
  };

  const handleOpenEdit = (c: CollectionItem) => {
    setEditingCollection(c);
    setFormName(c.name);
    setFormDescription(c.description ?? '');
    setFormIcon(c.icon);
    setFormColor(c.color);
    setFormIsSmart(c.isSmart);
    setFormRules(c.rules ?? {});
    setFormSortOrder(c.sortOrder);
    setShowCreateModal(true);
  };

  const handleSaveCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    if (editingCollection) {
      await updateCollection({
        id: editingCollection.id,
        name: formName.trim(),
        description: formDescription.trim(),
        icon: formIcon,
        color: formColor,
        rules: formIsSmart ? formRules : undefined,
        sortOrder: formSortOrder,
      });
    } else {
      const created = await createCollection({
        name: formName.trim(),
        description: formDescription.trim(),
        icon: formIcon,
        color: formColor,
        isSmart: formIsSmart,
        rules: formIsSmart ? formRules : undefined,
        sortOrder: formSortOrder,
      });
      if (created) {
        setActiveCollectionId(created.id);
      }
    }
    setShowCreateModal(false);
  };

  const filteredCollections = collections.filter((c) =>
    c.name.toLowerCase().includes(collectionSearch.toLowerCase())
  );

  const collectionGameItems: GameItem[] = selectedCollection
    ? (selectedCollection.gameIds
        .map((gId) => games.find((g) => g.id === gId))
        .filter(Boolean) as GameItem[])
    : [];

  const searchedGamesInCollection = collectionGameItems.filter((g) =>
    g.title.toLowerCase().includes(gameSearchInCollection.toLowerCase())
  );

  return (
    <div data-testid="collections-manager" className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
        {/* Left: Collections Sidebar List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-ms-muted uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-violet-400" />
              <span>Collections ({collections.length})</span>
            </h2>
            <button
              type="button"
              data-testid="create-collection-btn"
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
          </div>

          {/* Collection search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-ms-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search collections..."
              value={collectionSearch}
              onChange={(e) => setCollectionSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-xs bg-ms-card border border-ms-border rounded-lg text-ms-text focus:outline-none focus:border-violet-500"
            />
          </div>

          <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
            {filteredCollections.map((c) => {
              const IconComp = ICON_MAP[c.icon] ?? Folder;
              const isSelected = selectedCollection?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  data-testid={`collection-item-${c.id}`}
                  onClick={() => setActiveCollectionId(c.id)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-ms-elevated border border-violet-500/40 text-white shadow-sm'
                      : 'hover:bg-ms-card/80 text-ms-muted hover:text-ms-text border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-sm"
                      style={{ backgroundColor: `${c.color}20`, color: c.color }}
                    >
                      <IconComp className="w-3.5 h-3.5" />
                    </span>
                    <span className="truncate font-semibold">{c.name}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {c.isSmart && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 font-bold">
                        Smart
                      </span>
                    )}
                    <span className="text-[11px] tabular-nums text-ms-muted/80">
                      {c.gameIds.length}
                    </span>
                  </div>
                </button>
              );
            })}

            {filteredCollections.length === 0 && (
              <div className="p-4 text-center text-xs text-ms-muted">No collections found.</div>
            )}
          </div>
        </div>

        {/* Right: Active Collection Details & Games */}
        <div className="md:col-span-3 space-y-4">
          {selectedCollection ? (
            <div className="p-6 rounded-2xl bg-ms-card border border-ms-border space-y-6">
              {/* Collection Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ms-border/40 pb-5">
                <div className="flex items-center gap-3.5">
                  {(() => {
                    const IconComp = ICON_MAP[selectedCollection.icon] ?? Folder;
                    return (
                      <span
                        className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-md"
                        style={{
                          backgroundColor: `${selectedCollection.color}25`,
                          color: selectedCollection.color,
                        }}
                      >
                        <IconComp className="w-6 h-6" />
                      </span>
                    );
                  })()}

                  <div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-xl font-bold text-ms-text">{selectedCollection.name}</h2>
                      {selectedCollection.isSmart && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-violet-500/20 text-violet-300 border border-violet-500/30 font-bold uppercase tracking-wider">
                          Smart Rule-Based
                        </span>
                      )}
                    </div>
                    {selectedCollection.description && (
                      <p className="text-xs text-ms-muted mt-0.5">{selectedCollection.description}</p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {!selectedCollection.isSmart && (
                    <button
                      type="button"
                      data-testid="add-games-to-collection-btn"
                      onClick={() => setShowAddGamesModal(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                    >
                      Add Games
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="edit-collection-btn"
                    onClick={() => handleOpenEdit(selectedCollection)}
                    className="p-2 rounded-lg bg-ms-elevated hover:bg-ms-border text-ms-muted hover:text-ms-text transition-colors"
                    title="Edit Collection"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    data-testid="delete-collection-btn"
                    onClick={() => void deleteCollection(selectedCollection.id)}
                    className="p-2 rounded-lg bg-ms-elevated hover:bg-rose-500/20 text-ms-muted hover:text-rose-400 transition-colors"
                    title="Delete Collection"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Game Search in Collection */}
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 text-ms-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder={`Search ${searchedGamesInCollection.length} games in collection...`}
                    value={gameSearchInCollection}
                    onChange={(e) => setGameSearchInCollection(e.target.value)}
                    className="w-full h-8 pl-8 pr-3 text-xs bg-ms-elevated/40 border border-ms-border rounded-lg text-ms-text focus:outline-none focus:border-violet-500"
                  />
                </div>
                <span className="text-xs text-ms-muted">
                  {searchedGamesInCollection.length} of {collectionGameItems.length} games
                </span>
              </div>

              {/* Games Grid */}
              {searchedGamesInCollection.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {searchedGamesInCollection.map((game) => (
                    <div
                      key={game.id}
                      data-testid={`collection-game-${game.id}`}
                      className="group relative rounded-xl overflow-hidden bg-ms-elevated/40 border border-ms-border hover:border-violet-500/50 transition-all hover:scale-[1.02] cursor-pointer shadow-sm"
                      onClick={() => openGameDetails(game.id)}
                    >
                      <img
                        src={game.coverImage}
                        alt={game.title}
                        className="w-full aspect-[2/3] object-cover"
                      />
                      <div className="p-2.5 space-y-1">
                        <div className="text-xs font-bold text-ms-text truncate">{game.title}</div>
                        <div className="flex items-center justify-between text-[10px] text-ms-muted">
                          <span className="capitalize">{game.platformId}</span>
                          <span>{game.playtimeHours.toFixed(1)}h</span>
                        </div>
                      </div>

                      {/* Remove from manual collection button */}
                      {!selectedCollection.isSmart && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void removeGameFromCollection(selectedCollection.id, game.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 absolute top-2 right-2 p-1.5 rounded-lg bg-black/80 hover:bg-rose-600 text-white transition-all shadow"
                          title="Remove from collection"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-ms-muted">
                  {selectedCollection.isSmart
                    ? 'No games in your library match this smart collection rule.'
                    : 'This collection is empty. Click "Add Games" above to populate it.'}
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 text-center text-xs text-ms-muted rounded-2xl bg-ms-card border border-ms-border">
              Select or create a collection.
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Collection Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-ms-card border border-ms-border rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-ms-text">
                {editingCollection ? 'Edit Collection' : 'Create Game Collection'}
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-ms-muted hover:text-ms-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCollection} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-ms-muted block mb-1">Collection Name</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Currently Playing, Backlog, RPGs"
                  className="w-full h-9 px-3 text-xs bg-ms-elevated border border-ms-border rounded-lg text-ms-text focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ms-muted block mb-1">Description (Optional)</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Short note or description"
                  className="w-full h-9 px-3 text-xs bg-ms-elevated border border-ms-border rounded-lg text-ms-text focus:outline-none focus:border-violet-500"
                />
              </div>

              {/* Color Preset Selector */}
              <div>
                <label className="text-xs font-bold text-ms-muted block mb-1.5">Accent Color</label>
                <div className="flex items-center gap-2">
                  {COLOR_PRESETS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setFormColor(hex)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${
                        formColor === hex ? 'scale-110 border-white' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>

              {/* Icon Selector */}
              <div>
                <label className="text-xs font-bold text-ms-muted block mb-1.5">Collection Icon</label>
                <div className="flex items-center gap-2">
                  {Object.keys(ICON_MAP).map((iconKey) => {
                    const Comp = ICON_MAP[iconKey]!;
                    const isSelected = formIcon === iconKey;
                    return (
                      <button
                        key={iconKey}
                        type="button"
                        onClick={() => setFormIcon(iconKey)}
                        className={`p-2 rounded-lg border transition-all ${
                          isSelected
                            ? 'bg-violet-600 border-violet-500 text-white'
                            : 'bg-ms-elevated border-ms-border text-ms-muted hover:text-ms-text'
                        }`}
                      >
                        <Comp className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Smart Collection Toggle */}
              {!editingCollection && (
                <label className="flex items-center justify-between p-3 rounded-xl bg-ms-elevated/40 border border-ms-border/60 cursor-pointer">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-ms-text block">Smart Collection</span>
                    <span className="text-[11px] text-ms-muted block">
                      Auto-populate using platform, genre, playtime, or favorites rules
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formIsSmart}
                    onChange={(e) => setFormIsSmart(e.target.checked)}
                    className="w-4 h-4 accent-violet-600 rounded cursor-pointer"
                  />
                </label>
              )}

              {/* Smart Rules Options */}
              {formIsSmart && (
                <div className="p-3.5 rounded-xl bg-ms-elevated/30 border border-violet-500/30 space-y-3">
                  <div className="text-[11px] font-bold uppercase text-violet-400">Smart Criteria</div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] text-ms-muted font-bold block mb-1">Platform</label>
                      <select
                        value={formRules.platformId ?? ''}
                        onChange={(e) =>
                          setFormRules({
                            ...formRules,
                            platformId: e.target.value ? (e.target.value as PlatformId) : undefined,
                          })
                        }
                        className="w-full h-8 px-2 text-xs bg-ms-card border border-ms-border rounded-lg text-ms-text"
                      >
                        <option value="">Any Platform</option>
                        <option value="steam">Steam</option>
                        <option value="epic">Epic Games</option>
                        <option value="riot">Riot Games</option>
                        <option value="gog">GOG Galaxy</option>
                        <option value="ea">EA App</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-ms-muted font-bold block mb-1">Genre</label>
                      <input
                        type="text"
                        placeholder="e.g. Action, RPG"
                        value={formRules.genre ?? ''}
                        onChange={(e) =>
                          setFormRules({
                            ...formRules,
                            genre: e.target.value.trim() || undefined,
                          })
                        }
                        className="w-full h-8 px-2 text-xs bg-ms-card border border-ms-border rounded-lg text-ms-text"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(formRules.isFavorite)}
                        onChange={(e) =>
                          setFormRules({
                            ...formRules,
                            isFavorite: e.target.checked ? true : undefined,
                          })
                        }
                        className="w-3.5 h-3.5 accent-violet-600 rounded"
                      />
                      <span>Favorites Only</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(formRules.neverPlayed)}
                        onChange={(e) =>
                          setFormRules({
                            ...formRules,
                            neverPlayed: e.target.checked ? true : undefined,
                          })
                        }
                        className="w-3.5 h-3.5 accent-violet-600 rounded"
                      />
                      <span>Never Played</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-ms-muted hover:text-ms-text"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="save-collection-btn"
                  className="px-4 py-2 text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white rounded-xl shadow-md transition-all"
                >
                  {editingCollection ? 'Save Changes' : 'Create Collection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Games Modal for Manual Collections */}
      {showAddGamesModal && selectedCollection && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg bg-ms-card border border-ms-border rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-ms-text">
                Add Games to &ldquo;{selectedCollection.name}&rdquo;
              </h3>
              <button
                type="button"
                onClick={() => setShowAddGamesModal(false)}
                className="text-ms-muted hover:text-ms-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
              {games.map((game) => {
                const inCollection = selectedCollection.gameIds.includes(game.id);
                return (
                  <div
                    key={game.id}
                    className="p-2 rounded-xl bg-ms-elevated/40 hover:bg-ms-elevated flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={game.coverImage}
                        alt={game.title}
                        className="w-8 h-10 object-cover rounded shadow shrink-0"
                      />
                      <span className="font-bold text-ms-text truncate">{game.title}</span>
                    </div>

                    {inCollection ? (
                      <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Added
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void addGameToCollection(selectedCollection.id, game.id)}
                        className="px-2.5 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-bold"
                      >
                        + Add
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowAddGamesModal(false)}
                className="px-4 py-2 text-xs font-bold bg-ms-elevated hover:bg-ms-border text-ms-text rounded-xl"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
